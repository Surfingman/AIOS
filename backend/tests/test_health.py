from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _session() -> str:
    response = client.post("/api/session", json={"name": "건강 테스트", "age_group": "13-15"})
    assert response.status_code == 200
    return response.json()["session_id"]


def test_health_screening_upload_confirmation_and_intent_flow():
    session_id = _session()
    report = "BMI 26.4 공복혈당 108 HbA1c 5.8 LDL 139 HDL 48"
    upload = client.post(
        f"/api/health/{session_id}/screening",
        files={"file": ("screening.txt", report.encode("utf-8"), "text/plain")},
    )
    assert upload.status_code == 200
    preview = upload.json()["card"]
    assert preview["status"] == "pending_confirmation"
    assert preview["measurements"]["bmi"]["value"] == 26.4

    confirmation = client.post(
        f"/api/health/{session_id}/confirm",
        json={
            "measurements": preview["measurements"],
            "allergies": ["땅콩"],
            "conditions": [],
            "medications": [],
            "injuries": ["왼쪽 무릎"],
            "preferences": {"daily_minutes": 25},
        },
    )
    assert confirmation.status_code == 200
    assert confirmation.json()["profile"]["status"] == "confirmed"
    assert len(confirmation.json()["card"]["days"]) == 7

    intent = client.post(
        "/api/intent",
        json={"session_id": session_id, "text": "내 운동 프로그램 보여줘"},
    )
    assert intent.status_code == 200
    result = intent.json()["results"][0]
    assert result["capability"] == "health"
    assert result["card"]["kind"] == "wellness_program"


def test_provider_screening_data_still_requires_user_confirmation():
    session_id = _session()
    response = client.post(
        f"/api/health/{session_id}/screening-data",
        json={
            "provider": "Lab Health Center",
            "report_id": "report-001",
            "examined_at": "2026-08-20",
            "measurements": {
                "systolic_bp": {"label": "수축기 혈압", "value": 132, "unit": "mmHg"}
            },
        },
    )
    assert response.status_code == 200
    assert response.json()["card"]["status"] == "pending_confirmation"
    assert response.json()["card"]["source"]["extraction_method"] == "provider-api"