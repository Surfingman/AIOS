import asyncio
import hashlib
import hmac
import re
import secrets
import uuid
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app import workspace_ai
from app.health.service import create_wellness_program
from app.memory.store import memory_store
from app.models import CAPABILITY_IDS, AgeGroup
from app.safety.mediation import safety_mediation_layer
from app.tasks import TaskError, task_store, utc_now

router = APIRouter(prefix="/api/workspace")
workspaces = {}


async def expire_workspaces():
    while True:
        for session_id, workspace in list(workspaces.items()):
            if workspace.expires <= utc_now():
                workspace.revision += 1
                workspace.stop_connector()
                task_store.clear(session_id)
                memory_store._sessions.pop(session_id, None)
                workspaces.pop(session_id, None)
        await asyncio.sleep(30)


class Workspace:
    def __init__(self, session_id, token):
        self.session_id = session_id
        self.token_hash = hashlib.sha256(token.encode()).hexdigest()
        self.expires = utc_now() + timedelta(hours=8)
        self.consents = {name: False for name in ("ai", "transcript", "safety", "health", "learning", "guardian", "images")}
        self.images = []
        self.image_busy = False
        self.revision = 0
        self.segments = []
        self.candidates = []
        self.summary = ""
        self.notes = []
        self.alerts = []
        self.activity = []
        self.program = None
        self.connector = None
        self.connector_status = "disconnected"
        self.connector_error = ""
        self.pin_salt = secrets.token_hex(16)
        self.pin_hash = ""
        self.pin_failures = 0
        self.pin_locked_until = utc_now()
        self.mode = "manual"
        self.last_error = ""

    @property
    def session(self):
        return memory_store.get(self.session_id)

    def allowed(self, consent):
        if not self.consents[consent]:
            raise HTTPException(403, f"{consent} 동의가 필요합니다.")

    def stop_connector(self):
        if self.connector:
            self.connector.cancel()
            self.connector = None
        self.connector_status = "disconnected"

    def clear_derived(self, source):
        with task_store.lock:
            for task in task_store.items.get(self.session_id, {}).values():
                if task["source"] == source:
                    task["evidence"] = ""
                    if task["status"] == "pending":
                        task["status"] = "cancelled"
                    if source == "meeting":
                        task["arguments"]["title"] = "삭제된 회의 작업"

    def health_access(self):
        self.allowed("health")
        if "health" not in self.session.policy.allowed_capabilities:
            raise HTTPException(403, "건강 기능이 정책에서 차단됐습니다.")


def authenticate(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "세션을 다시 열어 주세요.")
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    for workspace in list(workspaces.values()):
        if hmac.compare_digest(workspace.token_hash, digest):
            if workspace.expires <= utc_now():
                workspace.stop_connector()
                task_store.clear(workspace.session_id)
                memory_store._sessions.pop(workspace.session_id, None)
                workspaces.pop(workspace.session_id, None)
                raise HTTPException(401, "세션이 만료됐습니다.")
            return workspace
    raise HTTPException(401, "유효하지 않은 세션입니다.")


class NewWorkspace(BaseModel):
    name: str = Field(default="나", min_length=1, max_length=40)


@router.post("/new")
def create_workspace(request: NewWorkspace):
    for session_id, workspace in list(workspaces.items()):
        if workspace.expires <= utc_now():
            workspace.stop_connector()
            task_store.clear(session_id)
            memory_store._sessions.pop(session_id, None)
            workspaces.pop(session_id, None)
    if len(workspaces) >= 100:
        raise HTTPException(429, "동시 세션 한도에 도달했습니다.")
    session_id, state = memory_store.create_session(request.name, "adult")
    token = secrets.token_urlsafe(32)
    workspaces[session_id] = Workspace(session_id, token)
    return {"session_id": session_id, "token": token, "policy": state.policy}


@router.get("")
def snapshot(workspace: Workspace = Depends(authenticate)):
    workspace.notes = [note for note in workspace.notes if datetime.fromisoformat(note["expires_at"]) > utc_now()]
    return {
        "session_id": workspace.session_id, "name": workspace.session.profile.name,
        "age_group": workspace.session.profile.age_group,
        "consents": workspace.consents, "tasks": task_store.list(workspace.session_id),
        "events": deepcopy(task_store.events.get(workspace.session_id, [])),
        "audit": deepcopy(task_store.audit.get(workspace.session_id, [])),
        "notes": workspace.notes, "alerts": workspace.alerts,
        "policy": workspace.session.policy, "guardian_locked": bool(workspace.pin_hash),
        "ai_configured": workspace_ai.configured(), "mode": workspace.mode,
        "last_error": workspace.last_error,
        "connector": {"status": workspace.connector_status, "error": workspace.connector_error},
        "health_ready": bool(workspace.program) or workspace.session.health_profile.get("status") == "confirmed",
        "retention": "session", "expires_at": workspace.expires.isoformat(),
    }


class ConsentUpdate(BaseModel):
    name: Literal["ai", "transcript", "safety", "health", "learning", "guardian", "images"]
    enabled: bool


@router.put("/consent")
def set_consent(request: ConsentUpdate, workspace: Workspace = Depends(authenticate)):
    workspace.consents[request.name] = request.enabled
    workspace.revision += 1
    if not request.enabled:
        if request.name == "images":
            workspace.images.clear()
        if request.name == "transcript":
            workspace.stop_connector()
            workspace.segments.clear()
            workspace.candidates.clear()
            workspace.summary = ""
            workspace.alerts.clear()
            workspace.clear_derived("meeting")
            workspace.notes = [note for note in workspace.notes if note["source"] != "learning"]
        if request.name in {"safety", "guardian"}:
            workspace.alerts.clear()
        if request.name == "health":
            workspace.program = None
            workspace.activity.clear()
            workspace.session.health_profile = {"status": "empty", "measurements": {}}
            workspace.clear_derived("health")
        if request.name == "learning":
            workspace.notes = [note for note in workspace.notes if note["source"] != "learning"]
    task_store.record(workspace.session_id, f"consent.{request.name}.{'on' if request.enabled else 'off'}")
    return snapshot(workspace)


class Proposal(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start: str = Field(max_length=50)
    minutes: int = Field(default=30, ge=5, le=180)
    context: Literal["work", "personal"] = "work"
    candidate_id: str | None = None


@router.post("/tasks")
def propose(request: Proposal, workspace: Workspace = Depends(authenticate)):
    evidence = ""
    source = "manual"
    if request.candidate_id:
        candidate = next((item for item in workspace.candidates if item["id"] == request.candidate_id), None)
        if not candidate:
            raise HTTPException(404, "근거가 만료됐습니다. 후보를 다시 생성하세요.")
        evidence = candidate["evidence"]
        source = "meeting"
    try:
        return task_store.propose(workspace.session_id, request.title, request.start, request.minutes, request.context, evidence, source)
    except TaskError as exc:
        raise HTTPException(422, str(exc)) from exc


class Approval(BaseModel):
    fingerprint: str = Field(min_length=64, max_length=64)


@router.post("/tasks/{task_id}/approve")
def approve(task_id: str, request: Approval, workspace: Workspace = Depends(authenticate)):
    task = task_store.items.get(workspace.session_id, {}).get(task_id)
    if task and task["source"] == "health" and task["status"] == "pending":
        workspace.health_access()
        if workspace.session.profile.age_group != "adult":
            raise HTTPException(403, "이 건강 일정 프로그램은 성인용입니다.")
        if workspace.program and any(flag.get("severity") in {"high", "urgent"} for flag in workspace.program.get("risk_flags", [])):
            raise HTTPException(409, "새 위험 신호를 먼저 확인하세요.")
    try:
        return task_store.approve(workspace.session_id, task_id, request.fingerprint, workspace.session.policy)
    except TaskError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/tasks/{task_id}/cancel")
def cancel(task_id: str, workspace: Workspace = Depends(authenticate)):
    try:
        return task_store.cancel(workspace.session_id, task_id)
    except TaskError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.delete("/events/{event_id}")
def remove_event(event_id: str, workspace: Workspace = Depends(authenticate)):
    with task_store.lock:
        events = task_store.events.get(workspace.session_id, [])
        event = next((item for item in events if item["id"] == event_id), None)
        if not event:
            raise HTTPException(404, "일정을 찾을 수 없습니다.")
        if "calendar" not in workspace.session.policy.allowed_capabilities:
            raise HTTPException(403, "일정 변경이 정책에서 차단됐습니다.")
        events.remove(event)
        task = task_store.items[workspace.session_id][event["task_id"]]
        task["status"] = "removed"
        task_store.record(workspace.session_id, "event.removed", event["task_id"])
    return {"status": "removed"}


class Segment(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=3000)
    speaker: Literal["self", "other"] = "other"
    source: Literal["manual", "sample", "translator"] = "manual"
    is_final: bool = True


def add_segment(workspace, segment):
    workspace.allowed("transcript")
    if not segment.is_final or any(item["id"] == segment.event_id for item in workspace.segments):
        return {"status": "ignored"}
    item = {"id": segment.event_id, "text": segment.text, "speaker": segment.speaker,
            "source": segment.source, "at": utc_now().isoformat(), "translation": ""}
    workspace.segments.append(item)
    workspace.segments = workspace.segments[-200:]
    if workspace.consents["safety"]:
        verdict = safety_mediation_layer.analyze("\n".join(entry["text"] for entry in workspace.segments[-12:]), [], workspace.session.policy)
        if verdict.risk_level in {"medium", "high"}:
            workspace.alerts.append({"id": str(uuid.uuid4()), "at": utc_now().isoformat(),
                "verdict": verdict.model_dump(), "guardian": workspace.consents["guardian"], "source": segment.source})
            workspace.alerts = workspace.alerts[-30:]
    return {"status": "accepted", "segment": item}


@router.post("/meeting/segments")
def receive_segment(request: Segment, workspace: Workspace = Depends(authenticate)):
    return add_segment(workspace, request)


@router.get("/meeting")
def meeting(workspace: Workspace = Depends(authenticate)):
    return {"segments": workspace.segments, "candidates": workspace.candidates, "summary": workspace.summary}


@router.delete("/meeting")
def clear_meeting(workspace: Workspace = Depends(authenticate)):
    workspace.stop_connector()
    workspace.segments.clear()
    workspace.candidates.clear()
    workspace.summary = ""
    workspace.alerts.clear()
    workspace.revision += 1
    workspace.clear_derived("meeting")
    workspace.notes = [note for note in workspace.notes if note["source"] != "learning"]
    return {"status": "cleared"}


async def ai_result(workspace, instruction, payload):
    workspace.last_error = ""
    if not workspace.consents["ai"] or not workspace_ai.configured():
        workspace.mode = "rules"
        return None
    revision = workspace.revision
    try:
        result = await workspace_ai.complete(instruction, payload)
    except Exception as exc:
        if revision != workspace.revision:
            raise HTTPException(409, "동의 변경으로 결과를 폐기했습니다.") from exc
        workspace.last_error = f"AI 연결 실패 ({type(exc).__name__}). 규칙 기반 결과를 사용합니다."
        workspace.mode = "rules"
        return None
    if revision != workspace.revision:
        raise HTTPException(409, "처리 중 동의 또는 데이터가 변경됐습니다. 결과를 폐기했습니다.")
    workspace.mode = "azure-ai"
    return result


@router.post("/meeting/analyze")
async def analyze_meeting(workspace: Workspace = Depends(authenticate)):
    workspace.allowed("transcript")
    segments = deepcopy(workspace.segments)
    if not segments:
        raise HTTPException(422, "먼저 대화 내용을 추가하세요.")
    result = await ai_result(workspace,
        'Extract proposed follow-up tasks. Schema: {"summary":str,"candidates":[{"title":str,"owner":str,"due_text":str,"evidence_ids":[str]}],"translations":[{"id":str,"text":str}]}. '
        'Every candidate must cite exact segment ids. Missing owner or date must say 확인 필요. Never infer calendar dates. Translate to Korean. At most 8 candidates.',
        {"segments": [{"id": item["id"], "text": item["text"]} for item in segments]})
    lookup = {item["id"]: item["text"] for item in segments}
    candidates = []
    if result:
        raw_candidates = result.get("candidates", [])
        if isinstance(raw_candidates, list):
            for candidate in raw_candidates[:8]:
                if not isinstance(candidate, dict) or not isinstance(candidate.get("title"), str):
                    continue
                evidence_ids = candidate.get("evidence_ids", [])
                if not isinstance(evidence_ids, list) or not evidence_ids or not all(isinstance(identifier, str) and identifier in lookup for identifier in evidence_ids):
                    continue
                candidates.append({"id": str(uuid.uuid4()), "title": candidate["title"][:200],
                    "owner": str(candidate.get("owner") or "확인 필요")[:100], "due_text": str(candidate.get("due_text") or "확인 필요")[:100],
                    "evidence": "\n".join(lookup[identifier] for identifier in evidence_ids)[:3000], "mode": "azure-ai"})
        translations = result.get("translations", [])
        if isinstance(translations, list):
            for translation in translations:
                if isinstance(translation, dict) and isinstance(translation.get("text"), str):
                    for item in workspace.segments:
                        if item["id"] == translation.get("id"):
                            item["translation"] = translation["text"][:3000]
        workspace.summary = str(result.get("summary", ""))[:4000]
    else:
        for item in segments:
            if re.search(r"\b(will|please|need to|action|send|review|prepare|schedule)\b|준비|공유|검토|보내|하기로|회의", item["text"], re.I):
                candidates.append({"id": str(uuid.uuid4()), "title": item["text"][:160], "owner": "확인 필요", "due_text": "확인 필요", "evidence": item["text"], "mode": "rules"})
        workspace.summary = "규칙 기반으로 후속 작업 표현을 추렸습니다. 담당자와 기한을 확인하세요."
    workspace.candidates = candidates[:8]
    return meeting(workspace)


async def translator_stream(workspace):
    import json
    from websockets.asyncio.client import connect
    try:
        async with connect("ws://127.0.0.1:8000/ws", open_timeout=4, max_size=100000) as socket:
            workspace.connector_status = "connected"
            stream_id = str(uuid.uuid4())
            async for message in socket:
                if not workspace.consents["transcript"] or workspace.expires <= utc_now():
                    break
                payload = json.loads(message)
                if not isinstance(payload, dict) or not isinstance(payload.get("seq"), (str, int)):
                    continue
                if payload.get("type") in {"final", "self_final"} and isinstance(payload.get("text"), str):
                    add_segment(workspace, Segment(event_id=f'{stream_id}:{payload.get("seq")}',
                        text=payload["text"][:3000], speaker="self" if payload["type"] == "self_final" else "other", source="translator"))
                if payload.get("type") == "translation_refined":
                    for item in workspace.segments:
                        if item["id"] == f'{stream_id}:{payload.get("seq")}':
                            item["translation"] = str(payload.get("translation", ""))[:3000]
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        workspace.connector_error = f"Translator 연결 실패 ({type(exc).__name__}). 8000 포트의 앱 실행 상태를 확인하세요."
    finally:
        if workspace.connector is None or workspace.connector is asyncio.current_task():
            workspace.connector_status = "disconnected"


@router.post("/connect/translator")
async def connect_translator(workspace: Workspace = Depends(authenticate)):
    workspace.allowed("transcript")
    if workspace.connector_status != "disconnected":
        return {"status": workspace.connector_status}
    workspace.connector_error = ""
    workspace.connector_status = "connecting"
    workspace.connector = asyncio.create_task(translator_stream(workspace))
    return {"status": "connecting"}


@router.delete("/connect/translator")
def disconnect_translator(workspace: Workspace = Depends(authenticate)):
    workspace.stop_connector()
    return {"status": "disconnected"}


@router.post("/learning")
async def learning(workspace: Workspace = Depends(authenticate)):
    workspace.allowed("learning")
    workspace.allowed("transcript")
    own = [item["text"] for item in workspace.segments if item["speaker"] == "self"]
    if not own:
        raise HTTPException(422, "본인 발화가 없습니다. 화자를 '나'로 선택해 추가하세요.")
    result = await ai_result(workspace, 'Give language coaching only for the user utterances. Return {"tips":[{"original":str,"improved":str,"reason":str}]}. Do not claim pronunciation assessment from text. At most 5 items.', {"utterances": own[-20:]})
    tips = result.get("tips", []) if result else [{"original": text, "improved": "", "reason": "복습할 본인 표현입니다. AI 연결 시 교정을 생성합니다."} for text in own[-5:]]
    if not isinstance(tips, list):
        tips = []
    return {"tips": [item for item in tips[:5] if isinstance(item, dict) and item.get("original") in own], "mode": workspace.mode}


class SafetyInput(BaseModel):
    text: str = Field(min_length=1, max_length=10000)


@router.post("/safety")
def analyze_safety(request: SafetyInput, workspace: Workspace = Depends(authenticate)):
    verdict = safety_mediation_layer.analyze(request.text, [], workspace.session.policy)
    return {"verdict": verdict}


@router.post("/chat")
async def chat(request: SafetyInput, workspace: Workspace = Depends(authenticate)):
    verdict = safety_mediation_layer.analyze(request.text, [], workspace.session.policy)
    if not verdict.allowed:
        return {"text": verdict.reason, "mode": "safety", "signals": verdict.signals}
    result = await ai_result(workspace,
        'You are Guardian, a concise assistant. Reply as {"text":str,"actions":[{"kind":"schedule|meeting|health|safety","title":str,"minutes":int}]}. '
        'Decompose multiple intents into at most 4 proposed actions. Schedule actions are drafts and require user to confirm date/time. Never claim you changed files, devices, calendar, sent messages, or accessed health/meeting data. Do not prescribe medical treatment.',
        {"question": request.text})
    actions = []
    if result and isinstance(result.get("actions"), list):
        for action in result["actions"][:4]:
            if isinstance(action, dict) and action.get("kind") in {"schedule", "meeting", "health", "safety"}:
                minutes = action.get("minutes", 30)
                actions.append({"kind": action["kind"], "title": str(action.get("title") or request.text)[:200],
                    "minutes": max(5, min(180, minutes)) if isinstance(minutes, int) else 30})
    elif not result:
        for pattern, kind, title in [(r"일정|약속|calendar|schedule", "schedule", request.text),
                (r"회의|통역|meeting|translate", "meeting", "회의 대화 확인"),
                (r"건강|운동|검진|health|exercise", "health", "건강 프로그램 확인"),
                (r"피싱|사기|안전|phishing|scam", "safety", "안전 검사")]:
            if re.search(pattern, request.text, re.I):
                actions.append({"kind": kind, "title": title[:200], "minutes": 30})
    return {"text": str(result.get("text", "응답을 만들지 못했습니다."))[:8000] if result else
            ("요청에서 다음 작업을 제안합니다. 일정의 날짜와 시간은 직접 확인한 뒤 승인해 주세요." if actions else "자유 대화에는 Azure AI 연결과 전송 동의가 필요합니다. 일정·회의·건강·안전 요청은 로컬에서도 작업 후보를 만들 수 있습니다."), "mode": workspace.mode, "actions": actions}


@router.get("/wellness")
def wellness(workspace: Workspace = Depends(authenticate)):
    workspace.health_access()
    if workspace.program is None and workspace.session.health_profile.get("status") == "confirmed":
        profile = workspace.session.health_profile
        workspace.program = create_wellness_program(profile["measurements"], profile.get("preferences", {}), profile)
        workspace.program["origin"] = "guardian-rules"
    return {"program": workspace.program, "activity": workspace.activity,
            "profile_status": workspace.session.health_profile.get("status", "empty")}


@router.post("/connect/health")
async def import_health(workspace: Workspace = Depends(authenticate)):
    workspace.health_access()
    revision = workspace.revision
    try:
        async with httpx.AsyncClient(timeout=50) as client:
            response = await client.get("http://127.0.0.1:8020/api/program")
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        raise HTTPException(502, f"Health Lab 연결 실패 ({type(exc).__name__}). 8020 포트의 앱을 확인하세요.") from exc
    if revision != workspace.revision:
        raise HTTPException(409, "동의 변경으로 가져오기를 중단했습니다.")
    program = payload.get("program", payload) if isinstance(payload, dict) else None
    if not isinstance(program, dict) or not isinstance(program.get("days"), list) or not program["days"]:
        raise HTTPException(422, "Health Lab에서 검진 결과를 확인하고 프로그램을 먼저 만드세요.")
    risks = program.get("risk_flags", [])
    if not isinstance(risks, list) or any(not isinstance(flag, dict) for flag in risks):
        raise HTTPException(422, "위험 신호 형식이 올바르지 않습니다.")
    days = []
    for day in program["days"][:7]:
        if not isinstance(day, dict):
            raise HTTPException(422, "잘못된 건강 프로그램 형식입니다.")
        exercises = day.get("exercises", [])
        if not isinstance(exercises, list) or not exercises or any(not isinstance(item, dict) for item in exercises):
            raise HTTPException(422, "운동 정보가 없는 프로그램입니다.")
        meals = day.get("meals", [])
        if not isinstance(meals, list) or any(not isinstance(meal, dict) or not isinstance(meal.get("steps", []), list) for meal in meals) or any(not isinstance(exercise.get("steps", []), list) for exercise in exercises):
            raise HTTPException(422, "운동 또는 식단 단계 형식이 올바르지 않습니다.")
        try:
            minutes = sum(int(item.get("minutes", 0)) for item in exercises)
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, "운동 시간이 유효하지 않습니다.") from exc
        if not 5 <= minutes <= 180:
            raise HTTPException(422, "운동 시간이 허용 범위를 벗어났습니다.")
        days.append({"day": str(day.get("day", "")), "title": str(day.get("focus", "운동")),
            "activity": ", ".join(str(item.get("name", "")) for item in exercises),
            "duration_minutes": minutes,
            "visual_steps": [{"text": str(step), "emoji": ""} for exercise in exercises for step in exercise.get("steps", [])][:8],
            "meals": [{"meal": str(meal.get("meal", "")), "name": str(meal.get("name", "")),
                "steps": [str(step) for step in meal.get("steps", [])][:10]} for meal in day.get("meals", []) if isinstance(meal, dict)]})
    workspace.clear_derived("health")
    workspace.program = {"title": "Health Lab 연결 프로그램", "days": days, "origin": "health-lab",
        "daily_minutes": days[0]["duration_minutes"], "intensity": "원본 프로그램 기준",
        "risk_flags": [{key: str(flag.get(key, ""))[:1000] for key in ("severity", "title", "message")} for flag in risks], "meal_guide": [],
        "stop_conditions": [str(item)[:1000] for item in program.get("stop_conditions", [])] if isinstance(program.get("stop_conditions", []), list) else [],
        "notice": "일반 웰니스 정보입니다. 의료 진단이나 처방이 아닙니다.", "generated_at": utc_now().isoformat(), "sources": ["AI Health Lab"]}
    return wellness(workspace)


class HealthSchedule(BaseModel):
    start: str = Field(max_length=50)
    day_index: int = Field(ge=0, le=6)


@router.post("/wellness/slots")
def health_slots(request: HealthSchedule, workspace: Workspace = Depends(authenticate)):
    program = wellness(workspace)["program"]
    if not program or request.day_index >= len(program.get("days", [])):
        raise HTTPException(422, "확인된 프로그램이 필요합니다.")
    try:
        begins = datetime.fromisoformat(request.start)
    except ValueError as exc:
        raise HTTPException(422, "시간 형식이 올바르지 않습니다.") from exc
    if begins.tzinfo is None or begins <= utc_now():
        raise HTTPException(422, "시간대가 있는 미래 시간을 선택하세요.")
    duration = timedelta(minutes=int(program["days"][request.day_index]["duration_minutes"]))
    slots = []
    with task_store.lock:
        events = deepcopy(task_store.events.get(workspace.session_id, []))
    for offset in range(7 * 24 * 4):
        candidate = begins + timedelta(minutes=15 * offset)
        if not 7 <= candidate.hour < 21 or (candidate + duration).hour >= 22:
            continue
        if all(not (candidate < datetime.fromisoformat(event["start"]) + timedelta(minutes=event["minutes"])
                and candidate + duration > datetime.fromisoformat(event["start"])) for event in events):
            slots.append(candidate.isoformat())
            if len(slots) == 3:
                break
    return {"slots": slots, "calendar": "local", "minutes": int(duration.total_seconds() / 60)}


@router.post("/wellness/schedule")
def schedule_health(request: HealthSchedule, workspace: Workspace = Depends(authenticate)):
    program = wellness(workspace)["program"]
    if not program or request.day_index >= len(program.get("days", [])):
        raise HTTPException(422, "확인된 건강 프로그램이 필요합니다.")
    if workspace.session.profile.age_group != "adult":
        raise HTTPException(403, "이 건강 일정 프로그램은 성인용입니다.")
    if any(flag.get("severity") in {"high", "urgent"} for flag in program.get("risk_flags", [])) or workspace.session.health_profile.get("injuries"):
        raise HTTPException(409, "위험 신호 또는 부상 정보가 있습니다. 전문가와 활동 적합성을 먼저 확인하세요.")
    day = program["days"][request.day_index]
    try:
        return task_store.propose(workspace.session_id, "개인 일정", request.start, int(day["duration_minutes"]), "personal", source="health")
    except (TaskError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc


class Activity(BaseModel):
    minutes: int = Field(ge=1, le=180)


@router.post("/wellness/activity")
def activity(request: Activity, workspace: Workspace = Depends(authenticate)):
    workspace.health_access()
    workspace.activity.append({"id": str(uuid.uuid4()), "minutes": request.minutes, "at": utc_now().isoformat()})
    workspace.activity = workspace.activity[-100:]
    return wellness(workspace)


class Note(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    context: Literal["work", "personal"] = "personal"
    days: int = Field(default=1, ge=1, le=7)
    source: Literal["manual", "learning"] = "manual"


@router.post("/notes")
def add_note(request: Note, workspace: Workspace = Depends(authenticate)):
    if request.source == "learning":
        workspace.allowed("learning")
    if len(workspace.notes) >= 100:
        raise HTTPException(409, "기억을 일부 삭제하세요. 최대 100개입니다.")
    note = {"id": str(uuid.uuid4()), **request.model_dump(), "expires_at": min(workspace.expires, utc_now() + timedelta(days=request.days)).isoformat()}
    workspace.notes.append(note)
    return note


@router.delete("/notes/{note_id}")
def remove_note(note_id: str, workspace: Workspace = Depends(authenticate)):
    workspace.notes = [note for note in workspace.notes if note["id"] != note_id]
    return {"status": "deleted"}


class PolicyUpdate(BaseModel):
    allowed_capabilities: list[str] = Field(max_length=5)
    blocked_domains: list[str] = Field(default_factory=list, max_length=50)
    age_group: AgeGroup = "adult"
    pin: str = Field(default="", max_length=64)
    new_pin: str | None = Field(default=None, min_length=6, max_length=64)


@router.put("/policy")
def set_policy(request: PolicyUpdate, workspace: Workspace = Depends(authenticate)):
    if any(capability not in CAPABILITY_IDS for capability in request.allowed_capabilities):
        raise HTTPException(422, "알 수 없는 기능입니다.")
    if workspace.pin_hash:
        if workspace.pin_locked_until > utc_now():
            raise HTTPException(429, "잠시 후 다시 시도하세요.")
        digest = hashlib.pbkdf2_hmac("sha256", request.pin.encode(), workspace.pin_salt.encode(), 200000).hex()
        if not hmac.compare_digest(digest, workspace.pin_hash):
            workspace.pin_failures += 1
            if workspace.pin_failures >= 5:
                workspace.pin_locked_until = utc_now() + timedelta(minutes=5)
            raise HTTPException(403, "보호자 PIN이 일치하지 않습니다.")
        workspace.pin_failures = 0
    if request.age_group != "adult" and not (workspace.pin_hash or request.new_pin):
        raise HTTPException(422, "아동 프로필을 사용하려면 보호자 PIN을 설정하세요.")
    if request.new_pin:
        workspace.pin_hash = hashlib.pbkdf2_hmac("sha256", request.new_pin.encode(), workspace.pin_salt.encode(), 200000).hex()
    workspace.session.policy.allowed_capabilities = request.allowed_capabilities
    workspace.session.policy.blocked_domains = request.blocked_domains
    workspace.session.profile.age_group = request.age_group
    task_store.record(workspace.session_id, "policy.updated")
    return snapshot(workspace)


@router.delete("")
def delete_workspace(workspace: Workspace = Depends(authenticate)):
    workspace.revision += 1
    workspace.stop_connector()
    task_store.clear(workspace.session_id)
    workspace.segments.clear()
    workspace.notes.clear()
    workspace.alerts.clear()
    workspace.program = None
    workspace.images.clear()
    memory_store._sessions.pop(workspace.session_id, None)
    workspaces.pop(workspace.session_id, None)
    return {"status": "deleted"}