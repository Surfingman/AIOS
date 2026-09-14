from datetime import datetime, timezone
import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.memory.store import memory_store
from app.health.service import SUPPORTED_CONTENT_TYPES, risk_flags, screening_preview, create_wellness_program
from app.models import (
    CAPABILITY_IDS,
    HealthConfirmationRequest,
    HealthScreeningDataRequest,
    IntentRequest,
    OrchestratorResponse,
    ParentPolicy,
    SessionCreateRequest,
    SessionCreateResponse,
    SafetyAnalysisRequest,
)
from app.orchestrator.orchestrator import AgentOrchestrator
from app.safety.mediation import safety_mediation_layer
from app.workspace import router as workspace_router, workspaces, authenticate, expire_workspaces
from app.workspace_images import router as images_router
from fastapi.responses import JSONResponse
from starlette.requests import Request

import app.capabilities  # noqa: F401  (registers built-in capabilities on import)

@asynccontextmanager
async def lifespan(app):
    cleanup = asyncio.create_task(expire_workspaces())
    yield
    cleanup.cancel()
    for workspace in list(workspaces.values()):
        workspace.stop_connector()
    with suppress(asyncio.CancelledError):
        await cleanup


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = AgentOrchestrator(memory_store)
MAX_HEALTH_DOCUMENT_BYTES = 10 * 1024 * 1024
app.include_router(workspace_router)
app.include_router(images_router)


@app.middleware("http")
async def protect_workspace_sessions(request: Request, call_next):
    session_id = next((part for part in request.url.path.split("/") if part in workspaces), None)
    if request.url.path == "/api/intent" and request.method == "POST":
        try:
            body = await request.json()
            session_id = body.get("session_id") if isinstance(body, dict) else None
        except ValueError:
            pass
    if session_id in workspaces:
        try:
            workspace = authenticate(request.headers.get("authorization", ""))
            if workspace.session_id != session_id:
                raise HTTPException(403, "다른 세션에 접근할 수 없습니다.")
            if request.url.path == "/api/intent":
                raise HTTPException(403, "작업 화면에서 실행을 제안하고 승인하세요.")
            if request.url.path.startswith("/api/policy/") and request.method == "PUT":
                raise HTTPException(403, "작업 공간의 보호자 설정을 사용하세요.")
            if request.url.path.startswith("/api/health/"):
                workspace.allowed("health")
                if request.method == "POST":
                    workspace.program = None
                    workspace.clear_derived("health")
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/session", response_model=SessionCreateResponse)
def create_session(req: SessionCreateRequest) -> SessionCreateResponse:
    session_id, state = memory_store.create_session(req.name, req.age_group)
    return SessionCreateResponse(session_id=session_id, profile=state.profile, policy=state.policy)


@app.post("/api/intent", response_model=OrchestratorResponse)
def handle_intent(req: IntentRequest) -> OrchestratorResponse:
    try:
        return orchestrator.handle(req.session_id, req.text)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/capabilities")
def list_capabilities() -> dict:
    return {"capabilities": CAPABILITY_IDS}


@app.post("/api/safety/analyze")
def analyze_safety(request: SafetyAnalysisRequest) -> dict:
    policy = ParentPolicy(child_id="standalone-safety")
    verdict = safety_mediation_layer.analyze(request.text, request.urls, policy)
    return {
        "verdict": verdict,
        "recommended_actions": (
            [
                "응답·송금·인증정보 제공을 중단하세요.",
                "메시지의 링크나 번호가 아닌 공식 연락처로 직접 확인하세요.",
                "이미 송금했다면 즉시 금융기관과 경찰에 연락하세요.",
            ]
            if not verdict.allowed
            else []
        ),
    }


@app.get("/api/policy/{session_id}", response_model=ParentPolicy)
def get_policy(session_id: str) -> ParentPolicy:
    state = memory_store.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="unknown session_id")
    return state.policy


@app.put("/api/policy/{session_id}", response_model=ParentPolicy)
def update_policy(session_id: str, policy: ParentPolicy) -> ParentPolicy:
    if memory_store.get(session_id) is None:
        raise HTTPException(status_code=404, detail="unknown session_id")
    policy.child_id = session_id
    memory_store.update_policy(session_id, policy)
    return policy


def _health_session(session_id: str):
    state = memory_store.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="unknown session_id")
    if "health" not in state.policy.allowed_capabilities:
        raise HTTPException(status_code=403, detail="health capability is not allowed")
    return state


@app.post("/api/health/{session_id}/screening")
async def upload_health_screening(
    session_id: str,
    file: UploadFile = File(...),
) -> dict:
    state = _health_session(session_id)
    workspace = workspaces.get(session_id)
    revision = workspace.revision if workspace else None
    content_type = (file.content_type or "").lower()
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="PDF, JPG, PNG 또는 TXT 파일만 지원합니다.")
    content = await file.read(MAX_HEALTH_DOCUMENT_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if len(content) > MAX_HEALTH_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="파일 크기는 10MB 이하여야 합니다.")
    try:
        preview = await asyncio.to_thread(screening_preview, content, content_type, file.filename or "health-screening")
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if workspace and (revision != workspace.revision or not workspace.consents["health"]):
        raise HTTPException(409, "동의 변경으로 추출 결과를 폐기했습니다.")
    state.health_profile = preview
    return {"card": {"kind": "health_screening_preview", "title": "건강검진 결과 확인", **preview}}


@app.get("/api/health/{session_id}")
def get_health_profile(session_id: str) -> dict:
    state = _health_session(session_id)
    return state.health_profile


@app.post("/api/health/{session_id}/screening-data")
def receive_health_screening_data(session_id: str, request: HealthScreeningDataRequest) -> dict:
    state = _health_session(session_id)
    measurements = {name: item.model_dump() for name, item in request.measurements.items()}
    state.health_profile = {
        "status": "pending_confirmation",
        "source": {
            "provider": request.provider,
            "report_id": request.report_id,
            "examined_at": request.examined_at,
            "extraction_method": "provider-api",
            "received_at": datetime.now(timezone.utc).isoformat(),
        },
        "measurements": measurements,
        "risk_flags": risk_flags(measurements),
        "notice": "검진센터에서 받은 결과입니다. 본인 결과인지 확인한 뒤 프로그램을 생성하세요.",
    }
    return {"card": {"kind": "health_screening_preview", "title": "건강검진 결과 확인", **state.health_profile}}


@app.post("/api/health/{session_id}/confirm")
def confirm_health_screening(session_id: str, request: HealthConfirmationRequest) -> dict:
    state = _health_session(session_id)
    pending = state.health_profile
    if pending.get("status") != "pending_confirmation":
        raise HTTPException(status_code=409, detail="먼저 건강검진 결과지를 업로드하세요.")
    measurements = (
        {name: item.model_dump() for name, item in request.measurements.items()}
        if request.measurements
        else pending.get("measurements", {})
    )
    if not measurements:
        raise HTTPException(status_code=422, detail="확인할 건강 수치가 없습니다.")
    state.health_profile = {
        "status": "confirmed",
        "measurements": measurements,
        "allergies": request.allergies,
        "conditions": request.conditions,
        "medications": request.medications,
        "injuries": request.injuries,
        "preferences": request.preferences,
        "risk_flags": risk_flags(measurements),
        "source": pending.get("source"),
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
    }
    return {
        "profile": state.health_profile,
        "card": create_wellness_program(measurements, request.preferences, state.health_profile),
    }


frontend_dist = Path(__file__).resolve().parents[2] / "frontend-canvas" / "dist"
os_dist = Path(__file__).resolve().parents[2] / "frontend-os" / "dist"
if os_dist.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/os", StaticFiles(directory=os_dist, html=True), name="os-ui")
if frontend_dist.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/workspace", StaticFiles(directory=frontend_dist, html=True), name="workspace-window")
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="workspace-ui")
