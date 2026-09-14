from app.capabilities.base import capability_registry
from app.health.service import create_wellness_program
from app.memory.store import SessionState
from app.models import Intent


class HealthCapability:
    id = "health"

    def execute(self, intent: Intent, session: SessionState) -> dict:
        profile = session.health_profile
        if profile.get("status") != "confirmed":
            return {
                "kind": "health_setup_required",
                "title": "건강검진 결과가 필요합니다",
                "message": "건강검진 결과지를 업로드하고 추출된 값을 확인해 주세요.",
            }
        return create_wellness_program(profile["measurements"], profile.get("preferences", {}), profile)


capability_registry.register(HealthCapability())