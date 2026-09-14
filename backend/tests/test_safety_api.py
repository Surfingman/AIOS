from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_standalone_safety_analysis_blocks_phishing_message_and_link():
    response = client.post(
        "/api/safety/analyze",
        json={
            "text": "금융감독원입니다. 지금 즉시 앱을 설치하고 안전 계좌로 송금하세요.",
            "urls": ["https://bit.ly/install-now"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"]["allowed"] is False
    assert body["verdict"]["risk_level"] == "high"
    assert body["recommended_actions"]