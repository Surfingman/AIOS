from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tasks import utc_now


@pytest.fixture
def session():
    with TestClient(app) as client:
        created = client.post("/api/workspace/new", json={}).json()
        client.headers["Authorization"] = f'Bearer {created["token"]}'
        yield client, created
        client.delete("/api/workspace")


def test_workspace_requires_token():
    with TestClient(app) as client:
        assert client.get("/api/workspace").status_code == 401


def test_private_health_endpoint_is_protected(session):
    client, created = session
    assert client.get(f'/api/health/{created["session_id"]}', headers={"Authorization": ""}).status_code == 401
    assert client.post("/api/intent", json={"session_id": created["session_id"], "text": "add event"}).status_code == 403


def test_consent_dedup_and_delete(session):
    client, _ = session
    segment = {"event_id": "one", "text": "Please review the plan."}
    assert client.post("/api/workspace/meeting/segments", json=segment).status_code == 403
    client.put("/api/workspace/consent", json={"name": "transcript", "enabled": True})
    assert client.post("/api/workspace/meeting/segments", json=segment).json()["status"] == "accepted"
    assert client.post("/api/workspace/meeting/segments", json=segment).json()["status"] == "ignored"
    analysis = client.post("/api/workspace/meeting/analyze").json()
    assert analysis["candidates"][0]["evidence"] == segment["text"]
    client.put("/api/workspace/consent", json={"name": "transcript", "enabled": False})
    assert client.get("/api/workspace/meeting").json()["segments"] == []


def test_approve_cancel_and_no_health_payload(session):
    client, _ = session
    request = {"title": "Check plan", "start": (utc_now() + timedelta(days=1)).isoformat(), "minutes": 30}
    task = client.post("/api/workspace/tasks", json=request).json()
    assert client.get("/api/workspace").json()["events"] == []
    approval = {"fingerprint": task["fingerprint"]}
    assert client.post(f'/api/workspace/tasks/{task["id"]}/approve', json=approval).status_code == 200
    client.post(f'/api/workspace/tasks/{task["id"]}/approve', json=approval)
    assert len(client.get("/api/workspace").json()["events"]) == 1
    assert "measurements" not in client.get("/api/workspace").text


def test_guardian_pin_cannot_be_bypassed(session):
    client, created = session
    policy = {"allowed_capabilities": ["health"], "age_group": "7-9", "new_pin": "123456"}
    assert client.put("/api/workspace/policy", json=policy).status_code == 200
    policy.pop("new_pin")
    policy["age_group"] = "adult"
    assert client.put("/api/workspace/policy", json=policy).status_code == 403
    assert client.put(f'/api/policy/{created["session_id"]}', json={"child_id": created["session_id"]}).status_code == 403
    policy["pin"] = "123456"
    assert client.put("/api/workspace/policy", json=policy).status_code == 200


def test_learning_only_receives_own_utterances(session, monkeypatch):
    client, _ = session
    for name in ("transcript", "ai", "learning"):
        client.put("/api/workspace/consent", json={"name": name, "enabled": True})
    client.post("/api/workspace/meeting/segments", json={"event_id": "other", "text": "company secret", "speaker": "other"})
    client.post("/api/workspace/meeting/segments", json={"event_id": "self", "text": "I will review this", "speaker": "self"})
    from app import workspace_ai
    monkeypatch.setattr(workspace_ai, "configured", lambda: True)
    async def fake(instruction, payload):
        assert payload == {"utterances": ["I will review this"]}
        return {"tips": []}
    monkeypatch.setattr(workspace_ai, "complete", fake)
    assert client.post("/api/workspace/learning").status_code == 200


def test_delete_revokes_access(session):
    client, _ = session
    assert client.delete("/api/workspace").status_code == 200
    assert client.get("/api/workspace").status_code == 401


def test_revocation_clears_derived_meeting_tasks(session):
    client, _ = session
    client.put("/api/workspace/consent", json={"name": "transcript", "enabled": True})
    client.post("/api/workspace/meeting/segments", json={"event_id": "private", "text": "Please review secret proposal"})
    candidate = client.post("/api/workspace/meeting/analyze").json()["candidates"][0]
    task = client.post("/api/workspace/tasks", json={"title": candidate["title"], "candidate_id": candidate["id"], "start": (utc_now() + timedelta(days=1)).isoformat()}).json()
    client.put("/api/workspace/consent", json={"name": "transcript", "enabled": False})
    snapshot = client.get("/api/workspace")
    assert "secret proposal" not in snapshot.text
    assert snapshot.json()["tasks"][0]["status"] == "cancelled"
    assert client.post(f'/api/workspace/tasks/{task["id"]}/approve', json={"fingerprint": task["fingerprint"]}).status_code == 409


def test_natural_language_proposes_multiple_actions_without_writes(session):
    client, _ = session
    response = client.post("/api/workspace/chat", json={"text": "일정 잡고 회의 통역도 준비해줘"})
    assert {item["kind"] for item in response.json()["actions"]} == {"schedule", "meeting"}
    assert client.get("/api/workspace").json()["events"] == []


def test_health_slots_exclude_busy_time_and_share_no_measurements(session):
    client, created = session
    client.put("/api/workspace/consent", json={"name": "health", "enabled": True})
    client.post(f'/api/health/{created["session_id"]}/screening-data', json={"provider": "sample", "report_id": "demo", "measurements": {"ldl": {"label": "LDL", "value": 100, "unit": "mg/dL"}}})
    assert client.post(f'/api/health/{created["session_id"]}/confirm', json={}).status_code == 200
    begins = (utc_now() + timedelta(days=1)).replace(hour=10, minute=0)
    task = client.post("/api/workspace/tasks", json={"title": "Busy", "start": begins.isoformat()}).json()
    client.post(f'/api/workspace/tasks/{task["id"]}/approve', json={"fingerprint": task["fingerprint"]})
    response = client.post("/api/workspace/wellness/slots", json={"day_index": 0, "start": begins.isoformat()})
    assert len(response.json()["slots"]) == 3
    assert response.json()["slots"][0] >= (begins + timedelta(minutes=30)).isoformat()
    assert "ldl" not in response.text


@pytest.mark.parametrize("malformed", [False, True])
def test_health_connector_validates_and_limits_data(session, monkeypatch, malformed):
    import httpx
    from app import workspace
    client, _ = session
    client.put("/api/workspace/consent", json={"name": "health", "enabled": True})
    payload = {"program": {"days": [{"day": "Mon", "exercises": [{"name": "Walk", "minutes": 30, "steps": ["Walk gently"]}], "meals": []}], "risk_flags": None if malformed else [], "measurements": {"private_ldl": 139}}}
    class Connection:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url):
            assert url == "http://127.0.0.1:8020/api/program"
            return httpx.Response(200, json=payload, request=httpx.Request("GET", url))
    monkeypatch.setattr(workspace.httpx, "AsyncClient", Connection)
    response = client.post("/api/workspace/connect/health")
    assert response.status_code == (422 if malformed else 200)
    assert "private_ldl" not in response.text
    if not malformed:
        assert response.json()["program"]["origin"] == "health-lab"


def test_ai_response_discarded_after_consent_change(session, monkeypatch):
    from app import workspace, workspace_ai
    client, created = session
    client.put("/api/workspace/consent", json={"name": "ai", "enabled": True})
    monkeypatch.setattr(workspace_ai, "configured", lambda: True)
    async def complete(instruction, payload):
        workspace.workspaces[created["session_id"]].revision += 1
        return {"text": "Discard me"}
    monkeypatch.setattr(workspace_ai, "complete", complete)
    assert client.post("/api/workspace/chat", json={"text": "Hello"}).status_code == 409


def test_translator_final_events_only_and_deduplicated(session, monkeypatch):
    import asyncio
    import json
    from websockets.asyncio import client as websocket_client
    from app import workspace
    client, created = session
    client.put("/api/workspace/consent", json={"name": "transcript", "enabled": True})
    target = workspace.workspaces[created["session_id"]]
    class Socket:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def __aiter__(self):
            for item in [{"type": "partial", "seq": 0, "text": "partial"}, {"type": "final", "seq": 1, "text": "Please review"}, {"type": "final", "seq": 1, "text": "Please review"}, {"type": "self_final", "seq": 2, "text": "I will review"}, {"type": "translation_refined", "seq": 1, "translation": "검토해 주세요"}]:
                yield json.dumps(item)
    monkeypatch.setattr(websocket_client, "connect", lambda *args, **kwargs: Socket())
    asyncio.run(workspace.translator_stream(target))
    assert len(target.segments) == 2
    assert target.segments[0]["translation"] == "검토해 주세요"
    assert target.segments[1]["speaker"] == "self"
    assert target.connector_status == "disconnected"