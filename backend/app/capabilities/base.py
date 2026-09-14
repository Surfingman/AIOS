from typing import Optional, Protocol

from app.memory.store import SessionState
from app.models import Intent


class Capability(Protocol):
    id: str

    def execute(self, intent: Intent, session: SessionState) -> dict:
        ...


class CapabilityRegistry:
    """Pluggable capability registry - third parties register their app here
    and automatically inherit the policy engine and safety mediation layer."""

    def __init__(self) -> None:
        self._capabilities: dict[str, Capability] = {}

    def register(self, capability: Capability) -> None:
        self._capabilities[capability.id] = capability

    def get(self, capability_id: str) -> Optional[Capability]:
        return self._capabilities.get(capability_id)

    def all_ids(self) -> list[str]:
        return list(self._capabilities.keys())


capability_registry = CapabilityRegistry()
