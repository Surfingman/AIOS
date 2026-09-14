import asyncio
import base64
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import workspace_images, workspace


@pytest.fixture
def session(monkeypatch):
    monkeypatch.setenv("AZURE_IMAGE_ENDPOINT", "https://example.services.ai.azure.com")
    monkeypatch.setenv("AZURE_IMAGE_DEPLOYMENT", "FLUX.2-pro")
    monkeypatch.setenv("AZURE_IMAGE_MODEL", "flux-2-pro")
    monkeypatch.setenv("AZURE_IMAGE_AUTH_MODE", "key")
    monkeypatch.setenv("AZURE_IMAGE_API_KEY", "test-only")
    with TestClient(app) as client:
        created = client.post("/api/workspace/new", json={}).json()
        client.headers["Authorization"] = f'Bearer {created["token"]}'
        yield client, workspace.workspaces[created["session_id"]]
        client.delete("/api/workspace")


def request():
    return {"request_id": "image-test-request-001", "prompt": "A red bicycle", "size": "square", "approved": True}


def test_consent_approval_and_idempotency(session, monkeypatch):
    client, target = session
    calls = []
    async def fake(*args):
        calls.append(args)
        return "data:image/png;base64,dGVzdA=="
    monkeypatch.setattr(workspace_images, "generate", fake)
    assert client.post("/api/workspace/images", json=request()).status_code == 403
    client.put("/api/workspace/consent", json={"name": "images", "enabled": True})
    assert client.post("/api/workspace/images", json={**request(), "approved": False}).status_code == 422
    assert client.post("/api/workspace/images", json=request()).status_code == 200
    assert client.post("/api/workspace/images", json=request()).status_code == 200
    assert len(calls) == 1
    assert "data_url" not in client.get("/api/workspace").text
    assert client.get("/api/workspace/images", headers={"Authorization": ""}).status_code == 401
    client.put("/api/workspace/consent", json={"name": "images", "enabled": False})
    assert target.images == []


def test_revoked_generation_discarded(session, monkeypatch):
    client, target = session
    client.put("/api/workspace/consent", json={"name": "images", "enabled": True})
    async def fake(*args):
        target.revision += 1
        return "discarded"
    monkeypatch.setattr(workspace_images, "generate", fake)
    assert client.post("/api/workspace/images", json=request()).status_code == 409
    assert target.images == [] and not target.image_busy


def test_busy_error_and_size_validation(session, monkeypatch):
    client, target = session
    client.put("/api/workspace/consent", json={"name": "images", "enabled": True})
    target.image_busy = True
    assert client.post("/api/workspace/images", json=request()).status_code == 409
    target.image_busy = False
    assert client.post("/api/workspace/images", json={**request(), "size": "huge"}).status_code == 422
    async def fake(*args):
        raise RuntimeError("secret-value")
    monkeypatch.setattr(workspace_images, "generate", fake)
    response = client.post("/api/workspace/images", json=request())
    assert response.status_code == 502 and "secret-value" not in response.text
    assert not target.image_busy


def test_flux_wire_contract(session, monkeypatch):
    encoded = base64.b64encode(b"\x89PNG\r\n\x1a\nimage").decode()
    class Connection:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def post(self, url, headers, json):
            assert url == "https://example.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro"
            assert headers == {"api-key": "test-only"}
            assert json == {"model": "FLUX.2-pro", "prompt": "A red bicycle", "width": 1024, "height": 1024}
            return httpx.Response(200, json={"data": [{"b64_json": encoded}]}, request=httpx.Request("POST", url))
    monkeypatch.setattr(workspace_images.httpx, "AsyncClient", Connection)
    assert asyncio.run(workspace_images.generate("A red bicycle", 1024, 1024)).startswith("data:image/png;base64,")


def test_aad_scope_and_missing_login(session, monkeypatch):
    from azure.core.exceptions import ClientAuthenticationError
    import azure.identity.aio
    client, target = session
    monkeypatch.setenv("AZURE_IMAGE_AUTH_MODE", "aad")
    class Credential:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get_token(self, scope):
            assert scope == "https://ai.azure.com/.default"
            raise ClientAuthenticationError("private diagnostic")
    monkeypatch.setattr(azure.identity.aio, "DefaultAzureCredential", Credential)
    client.put("/api/workspace/consent", json={"name": "images", "enabled": True})
    response = client.post("/api/workspace/images", json=request())
    assert response.status_code == 503
    assert "az login" in response.text and "private diagnostic" not in response.text
    assert not target.image_busy


def test_retention_deletion_and_child_policy(session, monkeypatch):
    client, target = session
    async def fake(*args):
        return "data:image/png;base64,dGVzdA=="
    monkeypatch.setattr(workspace_images, "generate", fake)
    client.put("/api/workspace/consent", json={"name": "images", "enabled": True})
    for index in range(4):
        assert client.post("/api/workspace/images", json={**request(), "request_id": f"retention-request-{index}"}).status_code == 200
    assert len(target.images) == 3
    assert client.delete("/api/workspace/images/retention-request-3").status_code == 200
    assert len(target.images) == 2
    target.session.profile.age_group = "7-9"
    assert client.post("/api/workspace/images", json=request()).status_code == 403