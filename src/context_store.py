"""Context & Memory Store

Simulates the AI-OS's unified context layer:
 - session context (short-term, per conversation)
 - long-term memory (user profile / preferences)
 - device & sensor state (mocked)
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class SessionContext:
    session_id: str
    history: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

    def add_turn(self, role: str, content: str):
        self.history.append({"role": role, "content": content, "ts": time.time()})


class ContextStore:
    """In-memory store standing in for a real persistent context/memory service."""

    def __init__(self):
        self._sessions: dict[str, SessionContext] = {}
        # Long-term memory: naive key/value user profile store
        self.user_profile: dict = {
            "name": "사용자",
            "preferred_meeting_hours": "10:00-18:00",
            "home_devices": ["거실 조명", "에어컨"],
        }
        # Device & sensor state (mocked - could be fed by real GPS/beacon/IMU data)
        self.device_state: dict = {
            "location": "서울시 중구 (남산 기준 X:1200m, Y:800m, Z:15m)",
            "battery": 82,
            "form_factor": "desktop",
        }

    def get_session(self, session_id: str) -> SessionContext:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionContext(session_id=session_id)
        return self._sessions[session_id]
