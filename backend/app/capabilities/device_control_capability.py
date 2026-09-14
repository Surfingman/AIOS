from app.capabilities.base import capability_registry
from app.memory.store import SessionState
from app.models import Intent


class DeviceControlCapability:
    id = "device_control"

    def execute(self, intent: Intent, session: SessionState) -> dict:
        state = session.device_state

        if intent.action == "volume_up":
            state["volume"] = min(100, state["volume"] + 10)
        elif intent.action == "volume_down":
            state["volume"] = max(0, state["volume"] - 10)
        elif intent.action == "brightness_set":
            state["brightness"] = intent.parameters.get("value", state["brightness"])
        elif intent.action == "wifi_toggle":
            state["wifi"] = not state["wifi"]

        return {
            "title": "기기 상태",
            "kind": "device_state",
            "state": dict(state),
        }


capability_registry.register(DeviceControlCapability())
