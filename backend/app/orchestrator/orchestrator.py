from typing import Optional

from app.capabilities.base import capability_registry
from app.intent.parser import intent_parser
from app.memory.store import MemoryStore, SessionState
from app.models import CapabilityResult, Intent, OrchestratorResponse, SafetyVerdict
from app.policy.engine import permission_engine
from app.safety.mediation import safety_mediation_layer


class AgentOrchestrator:
    """Parses intent, checks parent policy *before* execution, routes to a
    Capability, then mediates any outbound link/message before it ever
    reaches the child."""

    def __init__(self, memory_store: MemoryStore) -> None:
        self.memory_store = memory_store

    def handle(self, session_id: str, text: str) -> OrchestratorResponse:
        session = self.memory_store.get(session_id)
        if session is None:
            raise ValueError(f"unknown session_id: {session_id}")

        inbound_verdict = safety_mediation_layer.vet_message(text)
        if not inbound_verdict.allowed:
            intent = Intent(capability="safety", action="block_scam", parameters={}, raw_text=text)
            response = OrchestratorResponse(
                session_id=session_id,
                orb_state="speaking",
                intents=[intent],
                results=[CapabilityResult(
                    capability="safety",
                    action="block_scam",
                    status="blocked",
                    card={
                        "title": "피싱 의심 요청을 중단했습니다",
                        "message": inbound_verdict.reason,
                        "signals": inbound_verdict.signals,
                        "next_steps": [
                            "상대방과 통화를 끊고 링크를 열지 마세요.",
                            "송금·인증번호·비밀번호 제공을 중단하세요.",
                            "기관이나 가족의 저장된 공식 연락처로 직접 확인하세요.",
                        ],
                    },
                    safety=inbound_verdict,
                )],
            )
            self.memory_store.record_turn(session_id, text, response.model_dump())
            return response

        intents = intent_parser.parse(text)
        results = [self._route(intent, session) for intent in intents]

        response = OrchestratorResponse(
            session_id=session_id,
            orb_state="speaking",
            intents=intents,
            results=results,
        )
        self.memory_store.record_turn(session_id, text, response.model_dump())
        return response

    def _route(self, intent: Intent, session: SessionState) -> CapabilityResult:
        decision = permission_engine.evaluate(session.profile, session.policy, intent)
        if not decision.allowed:
            return CapabilityResult(
                capability=intent.capability,
                action=intent.action,
                status="blocked",
                card={"title": "이 기능은 지금 사용할 수 없어요", "message": decision.reason},
                policy=decision,
            )

        capability = capability_registry.get(intent.capability)
        if capability is None:
            return CapabilityResult(
                capability=intent.capability,
                action=intent.action,
                status="error",
                card={"title": "오류", "message": f"'{intent.capability}' capability를 찾을 수 없어요."},
                policy=decision,
            )

        try:
            card = capability.execute(intent, session)
        except Exception as exc:  # a capability failure must never crash the orchestrator
            return CapabilityResult(
                capability=intent.capability,
                action=intent.action,
                status="error",
                card={"title": "오류", "message": str(exc)},
                policy=decision,
            )

        safety_verdict = self._mediate(card, session)
        if safety_verdict is not None and not safety_verdict.allowed:
            return CapabilityResult(
                capability=intent.capability,
                action=intent.action,
                status="blocked",
                card={"title": "안전을 위해 차단했어요", "message": safety_verdict.reason},
                safety=safety_verdict,
                policy=decision,
            )

        return CapabilityResult(
            capability=intent.capability,
            action=intent.action,
            status="ok",
            card=card,
            safety=safety_verdict,
            policy=decision,
        )

    def _mediate(self, card: dict, session: SessionState) -> Optional[SafetyVerdict]:
        """Every nested link and message crosses the same safety boundary."""
        return safety_mediation_layer.vet_payload(card, session.policy)
