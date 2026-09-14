import os
import re
from datetime import datetime, timezone
from typing import Any

SUPPORTED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/plain",
}

MEASUREMENT_PATTERNS: dict[str, tuple[str, str]] = {
    "height_cm": (r"(?:키|신장|height)\s*[:：]?\s*(\d+(?:\.\d+)?)", "cm"),
    "weight_kg": (r"(?:체중|weight)\s*[:：]?\s*(\d+(?:\.\d+)?)", "kg"),
    "bmi": (r"(?:BMI|체질량지수)\s*[:：]?\s*(\d+(?:\.\d+)?)", "kg/m2"),
    "systolic_bp": (r"(?:수축기(?:혈압)?|systolic)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mmHg"),
    "diastolic_bp": (r"(?:이완기(?:혈압)?|diastolic)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mmHg"),
    "fasting_glucose": (r"(?:공복혈당|fasting glucose)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mg/dL"),
    "hba1c": (r"(?:당화혈색소|HbA1c)\s*[:：]?\s*(\d+(?:\.\d+)?)", "%"),
    "total_cholesterol": (r"(?:총콜레스테롤|total cholesterol)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mg/dL"),
    "ldl": (r"(?:LDL(?:-?콜레스테롤)?)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mg/dL"),
    "hdl": (r"(?:HDL(?:-?콜레스테롤)?)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mg/dL"),
    "triglycerides": (r"(?:중성지방|triglycerides?)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mg/dL"),
    "ast": (r"(?:AST|GOT)\s*[:：]?\s*(\d+(?:\.\d+)?)", "U/L"),
    "alt": (r"(?:ALT|GPT)\s*[:：]?\s*(\d+(?:\.\d+)?)", "U/L"),
    "creatinine": (r"(?:크레아티닌|creatinine)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mg/dL"),
    "egfr": (r"(?:eGFR|사구체여과율)\s*[:：]?\s*(\d+(?:\.\d+)?)", "mL/min/1.73m2"),
}

LABELS = {
    "height_cm": "키",
    "weight_kg": "체중",
    "bmi": "BMI",
    "systolic_bp": "수축기 혈압",
    "diastolic_bp": "이완기 혈압",
    "fasting_glucose": "공복혈당",
    "hba1c": "당화혈색소",
    "total_cholesterol": "총콜레스테롤",
    "ldl": "LDL 콜레스테롤",
    "hdl": "HDL 콜레스테롤",
    "triglycerides": "중성지방",
    "ast": "AST",
    "alt": "ALT",
    "creatinine": "크레아티닌",
    "egfr": "eGFR",
}

DEMO_TEXT = """
신장 172 cm 체중 78 kg BMI 26.4
수축기혈압 138 mmHg 이완기혈압 88 mmHg
공복혈당 108 mg/dL 당화혈색소 5.8 %
총콜레스테롤 212 mg/dL LDL 139 mg/dL HDL 48 mg/dL 중성지방 148 mg/dL
AST 31 U/L ALT 42 U/L 크레아티닌 0.92 mg/dL eGFR 94
"""


def extract_document_text(content: bytes, content_type: str) -> tuple[str, str]:
    if content_type == "text/plain":
        return content.decode("utf-8-sig", errors="replace"), "text"

    endpoint = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "").strip()
    key = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY", "").strip()
    if endpoint and key:
        try:
            from azure.ai.documentintelligence import DocumentIntelligenceClient
            from azure.core.credentials import AzureKeyCredential
        except ImportError as exc:
            raise RuntimeError("azure-ai-documentintelligence 패키지를 설치해야 합니다.") from exc
        client = DocumentIntelligenceClient(endpoint=endpoint, credential=AzureKeyCredential(key))
        poller = client.begin_analyze_document("prebuilt-layout", content)
        result = poller.result()
        return result.content or "", "azure-document-intelligence"

    if os.getenv("HEALTH_LAB_DEMO", "").strip() == "1":
        return DEMO_TEXT, "lab-demo"
    raise RuntimeError(
        "PDF/이미지 OCR에는 AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT와 "
        "AZURE_DOCUMENT_INTELLIGENCE_KEY가 필요합니다. 랩 데모는 HEALTH_LAB_DEMO=1을 설정하세요."
    )


def parse_measurements(text: str) -> dict[str, dict[str, Any]]:
    measurements: dict[str, dict[str, Any]] = {}
    for name, (pattern, unit) in MEASUREMENT_PATTERNS.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            measurements[name] = {
                "label": LABELS[name],
                "value": float(match.group(1)),
                "unit": unit,
            }
    if "bmi" not in measurements and "height_cm" in measurements and "weight_kg" in measurements:
        height_m = measurements["height_cm"]["value"] / 100
        measurements["bmi"] = {
            "label": LABELS["bmi"],
            "value": round(measurements["weight_kg"]["value"] / (height_m * height_m), 1),
            "unit": "kg/m2",
        }
    return measurements


def risk_flags(measurements: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    values = {name: item["value"] for name, item in measurements.items()}
    flags: list[dict[str, str]] = []

    def add(condition: bool, severity: str, title: str, message: str) -> None:
        if condition:
            flags.append({"severity": severity, "title": title, "message": message})

    add(values.get("systolic_bp", 0) >= 180 or values.get("diastolic_bp", 0) >= 120, "urgent", "혈압 긴급 확인", "즉시 안정을 취하고 의료기관에 연락하세요.")
    add(140 <= values.get("systolic_bp", 0) < 180 or 90 <= values.get("diastolic_bp", 0) < 120, "high", "높은 혈압", "고강도 운동 전에 의료 전문가와 상담하세요.")
    add(100 <= values.get("fasting_glucose", 0) < 126 or 5.7 <= values.get("hba1c", 0) < 6.5, "attention", "혈당 관리 필요", "규칙적인 식사와 활동을 유지하고 추적 검사를 확인하세요.")
    add(values.get("fasting_glucose", 0) >= 126 or values.get("hba1c", 0) >= 6.5, "high", "혈당 수치 확인 필요", "결과를 의료 전문가와 확인한 뒤 운동 강도를 정하세요.")
    add(values.get("ldl", 0) >= 160, "attention", "LDL 콜레스테롤 높음", "포화지방을 줄이고 의료 전문가의 평가를 확인하세요.")
    add(values.get("triglycerides", 0) >= 500, "high", "중성지방 매우 높음", "운동·식단 프로그램 시작 전 의료 전문가에게 확인하세요.")
    add(values.get("egfr", 999) < 60, "high", "신장 기능 확인 필요", "단백질·수분 권고를 개인화하기 전에 의료 전문가와 상담하세요.")
    add(values.get("ast", 0) >= 120 or values.get("alt", 0) >= 120, "high", "간 수치 확인 필요", "고강도 운동과 보충제 사용 전에 의료 전문가와 상담하세요.")
    return flags


def screening_preview(content: bytes, content_type: str, filename: str) -> dict[str, Any]:
    text, extraction_method = extract_document_text(content, content_type)
    measurements = parse_measurements(text)
    if not measurements:
        raise ValueError("지원하는 건강검진 수치를 찾지 못했습니다. 선명한 문서인지 확인하세요.")
    return {
        "status": "pending_confirmation",
        "source": {
            "filename": filename,
            "extraction_method": extraction_method,
            "received_at": datetime.now(timezone.utc).isoformat(),
        },
        "measurements": measurements,
        "risk_flags": risk_flags(measurements),
        "notice": "OCR 결과는 오류가 있을 수 있습니다. 원본 검진표와 비교해 확인하세요.",
    }


def create_wellness_program(
    measurements: dict[str, dict[str, Any]],
    preferences: dict[str, Any],
    health_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    flags = risk_flags(measurements)
    health_context = health_context or {}
    high_risk = any(flag["severity"] in {"urgent", "high"} for flag in flags)
    daily_minutes = 20 if high_risk else int(preferences.get("daily_minutes", 30))
    intensity = "낮음" if high_risk else "낮음-중간"
    exercise_days = [
        ("월", "걷기와 자세", "편안한 속도로 걷기", "🚶"),
        ("화", "하체 기초", "의자 스쿼트와 종아리 들기", "🪑"),
        ("수", "회복", "가벼운 산책과 전신 스트레칭", "🧘"),
        ("목", "상체 기초", "벽 밀기와 밴드 당기기", "🧱"),
        ("금", "유산소", "대화 가능한 속도로 빠르게 걷기", "👟"),
        ("토", "균형", "의자 옆 한 발 서기와 관절 가동", "⚖️"),
        ("일", "점검", "휴식하며 다음 주 컨디션 기록", "📝"),
    ]
    meals = [
        {"meal": "아침", "plate": ["통곡물 또는 고구마", "달걀·두부 등 단백질", "채소 또는 무가당 과일"]},
        {"meal": "점심", "plate": ["채소 1/2 접시", "잡곡 1/4 접시", "생선·콩·살코기 1/4 접시"]},
        {"meal": "저녁", "plate": ["채소 중심", "적당한 단백질", "늦은 야식과 단 음료 줄이기"]},
    ]
    considerations = []
    for key, label in (
        ("allergies", "알레르기 제외"),
        ("conditions", "기저질환 확인"),
        ("medications", "복용 약물과 운동·식사 시간 확인"),
        ("injuries", "통증·부상 부위 보호"),
    ):
        values = health_context.get(key) or []
        if values:
            considerations.append({"title": label, "items": values})
    return {
        "kind": "wellness_program",
        "title": "검진 결과 기반 7일 웰니스 프로그램",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "intensity": intensity,
        "daily_minutes": daily_minutes,
        "days": [
            {
                "day": day,
                "title": title,
                "duration_minutes": daily_minutes if day not in {"수", "일"} else 15,
                "activity": activity,
                "visual_steps": [
                    {"emoji": "🫁", "text": "5분간 천천히 몸을 풉니다."},
                    {"emoji": emoji, "text": f"{activity}를 통증 없는 범위에서 진행합니다."},
                    {"emoji": "💧", "text": "마무리 후 호흡과 컨디션을 기록합니다."},
                ],
            }
            for day, title, activity, emoji in exercise_days
        ],
        "meal_guide": meals,
        "personal_considerations": considerations,
        "risk_flags": flags,
        "stop_conditions": ["가슴 통증", "심한 숨참", "실신 또는 심한 어지럼", "새로운 관절 통증"],
        "sources": [
            "WHO Guidelines on physical activity and sedentary behaviour (2020)",
            "대한고혈압학회 고혈압 진료지침",
            "대한당뇨병학회 당뇨병 진료지침",
        ],
        "notice": "의료 진단이나 처방이 아닌 일반 웰니스 계획입니다. 위험 경고가 있으면 의료 전문가 확인을 우선하세요.",
    }