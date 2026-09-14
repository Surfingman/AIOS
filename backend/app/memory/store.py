import uuid
from typing import Any, Optional

from app.models import CAPABILITY_IDS, ChildProfile, ParentPolicy


class SessionState:
    """Live context for one child session: profile, policy, history, device state."""

    def __init__(self, profile: ChildProfile, policy: ParentPolicy) -> None:
        self.profile = profile
        self.policy = policy
        self.history: list[dict[str, Any]] = []
        self.device_state: dict[str, Any] = {"volume": 40, "brightness": 70, "wifi": True}
        self.calendar_events: list[dict[str, Any]] = []
        self.health_profile: dict[str, Any] = {
            "status": "empty",
            "measurements": {},
            "source": None,
            "confirmed_at": None,
        }
        self.files: list[dict[str, Any]] = [
            {"name": "숙제_수학.pdf", "kind": "pdf"},
            {"name": "그림일기.png", "kind": "image"},
            {"name": "독서기록장.docx", "kind": "doc"},
        ]


class MemoryStore:
    """Session-scoped context & memory store (in-memory demo implementation)."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def create_session(self, name: str, age_group: str) -> tuple[str, SessionState]:
        child_id = str(uuid.uuid4())
        profile = ChildProfile(child_id=child_id, name=name, age_group=age_group)
        policy = ParentPolicy(child_id=child_id, allowed_capabilities=list(CAPABILITY_IDS))
        state = SessionState(profile, policy)
        self._sessions[child_id] = state
        return child_id, state

    def get(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)

    def record_turn(self, session_id: str, text: str, response: dict[str, Any]) -> None:
        state = self.get(session_id)
        if state is None:
            return
        state.history.append({"text": text, "response": response})

    def update_policy(self, session_id: str, policy: ParentPolicy) -> None:
        state = self.get(session_id)
        if state is not None:
            state.policy = policy


memory_store = MemoryStore()
