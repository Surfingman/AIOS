from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

AgeGroup = Literal["7-9", "10-12", "13-15", "adult"]
OrbState = Literal["idle", "listening", "thinking", "speaking"]
RiskLevel = Literal["none", "low", "medium", "high"]
ResultStatus = Literal["ok", "blocked", "error"]

CAPABILITY_IDS = ["calendar", "web_search", "device_control", "files", "health"]


class ChildProfile(BaseModel):
    child_id: str
    name: str
    age_group: AgeGroup


class ParentPolicy(BaseModel):
    child_id: str
    allowed_capabilities: list[str] = Field(default_factory=lambda: list(CAPABILITY_IDS))
    allowed_domains: list[str] = Field(default_factory=list)
    blocked_domains: list[str] = Field(default_factory=list)
    attention_sensing_enabled: bool = False


class Intent(BaseModel):
    capability: str
    action: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    raw_text: str


class PolicyDecision(BaseModel):
    allowed: bool
    reason: str


class SafetyVerdict(BaseModel):
    allowed: bool
    reason: str
    risk_level: RiskLevel = "none"
    checked_url: Optional[str] = None
    signals: list[str] = Field(default_factory=list)


class CapabilityResult(BaseModel):
    capability: str
    action: str
    status: ResultStatus
    card: dict[str, Any]
    safety: Optional[SafetyVerdict] = None
    policy: Optional[PolicyDecision] = None


class IntentRequest(BaseModel):
    session_id: str
    text: str


class SafetyAnalysisRequest(BaseModel):
    text: str = Field(default="", max_length=50000)
    urls: list[str] = Field(default_factory=list, max_length=20)


class OrchestratorResponse(BaseModel):
    session_id: str
    orb_state: OrbState
    intents: list[Intent]
    results: list[CapabilityResult]


class SessionCreateRequest(BaseModel):
    name: str
    age_group: AgeGroup


class SessionCreateResponse(BaseModel):
    session_id: str
    profile: ChildProfile
    policy: ParentPolicy


class HealthMeasurement(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    value: float
    unit: str = Field(max_length=50)


class HealthConfirmationRequest(BaseModel):
    measurements: dict[str, HealthMeasurement] = Field(default_factory=dict)
    allergies: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    injuries: list[str] = Field(default_factory=list)
    preferences: dict[str, Any] = Field(default_factory=dict)


class HealthScreeningDataRequest(BaseModel):
    measurements: dict[str, HealthMeasurement]
    provider: str = Field(min_length=1, max_length=200)
    report_id: str = Field(min_length=1, max_length=200)
    examined_at: Optional[str] = None
