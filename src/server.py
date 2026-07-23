"""AI-Native OS prototype server.

Exposes:
 - POST /api/intent   { session_id, text } -> { request_id, cards }
 - GET  /api/state     -> device/context state (for the UI status bar)
 - static files for the Adaptive UI (ui/)
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from context_store import ContextStore
from orchestrator import AgentOrchestrator

BASE_DIR = Path(__file__).resolve().parent.parent
UI_DIR = BASE_DIR / "ui"
UI3D_DIR = BASE_DIR / "ui3d"

app = FastAPI(title="AI-Native OS Prototype")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

context_store = ContextStore()
orchestrator = AgentOrchestrator(context_store)


class IntentRequest(BaseModel):
    session_id: str = "default"
    text: str


@app.post("/api/intent")
def post_intent(req: IntentRequest):
    return orchestrator.handle_intent(req.session_id, req.text)


@app.get("/api/state")
def get_state():
    return context_store.device_state


@app.get("/api/history/{session_id}")
def get_history(session_id: str):
    session = context_store.get_session(session_id)
    return {"history": session.history}


app.mount("/3d", StaticFiles(directory=str(UI3D_DIR), html=True), name="ui3d")
app.mount("/", StaticFiles(directory=str(UI_DIR), html=True), name="ui")
