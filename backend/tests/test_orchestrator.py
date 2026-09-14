from app.memory.store import MemoryStore
from app.orchestrator.orchestrator import AgentOrchestrator


def _new_orchestrator():
    store = MemoryStore()
    session_id, _ = store.create_session("테스트", "10-12")
    return AgentOrchestrator(store), session_id


def test_single_intent_calendar():
    orchestrator, session_id = _new_orchestrator()
    response = orchestrator.handle(session_id, "내일 오후 3시에 축구 약속 잡아줘")
    assert len(response.results) == 1
    assert response.results[0].capability == "calendar"
    assert response.results[0].status == "ok"


def test_multi_intent_decomposition():
    orchestrator, session_id = _new_orchestrator()
    response = orchestrator.handle(session_id, "볼륨 높여줘 그리고 내 파일 보여줘")
    capabilities = {r.capability for r in response.results}
    assert capabilities == {"device_control", "files"}


def test_allowlist_blocks_capability_outside_the_list():
    orchestrator, session_id = _new_orchestrator()
    session = orchestrator.memory_store.get(session_id)
    session.policy.allowed_capabilities = ["calendar"]

    response = orchestrator.handle(session_id, "볼륨 높여줘")
    assert response.results[0].status == "blocked"


def test_safety_mediation_blocks_scam_style_search_result():
    orchestrator, session_id = _new_orchestrator()
    response = orchestrator.handle(session_id, "무료 선물 이벤트 검색해줘")
    assert response.results[0].status == "blocked"
    assert response.results[0].safety is not None
    assert response.results[0].safety.allowed is False


def test_voice_phishing_is_blocked_before_capability_for_child_and_adult():
    for age_group in ("7-9", "adult"):
        store = MemoryStore()
        session_id, _ = store.create_session("사용자", age_group)
        response = AgentOrchestrator(store).handle(
            session_id,
            "경찰입니다. 긴급합니다. 안전 계좌로 송금하고 OTP를 알려주세요.",
        )
        assert response.results[0].capability == "safety"
        assert response.results[0].status == "blocked"
        assert response.results[0].safety.risk_level == "high"
