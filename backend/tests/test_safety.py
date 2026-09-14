from app.models import ParentPolicy
from app.safety.mediation import safety_mediation_layer


def test_safe_domain_allowed():
    policy = ParentPolicy(child_id="c1")
    verdict = safety_mediation_layer.vet_url("kids.safe-encyclopedia.example.org/search", policy)
    assert verdict.allowed is True


def test_scam_keyword_blocked():
    policy = ParentPolicy(child_id="c1")
    verdict = safety_mediation_layer.vet_url("free-gift-claim-now.xyz/verify-account", policy)
    assert verdict.allowed is False
    assert verdict.risk_level in {"medium", "high"}


def test_ip_address_host_blocked():
    policy = ParentPolicy(child_id="c1")
    verdict = safety_mediation_layer.vet_url("http://192.168.0.1/login", policy)
    assert verdict.allowed is False


def test_parent_blocked_domain_wins():
    policy = ParentPolicy(child_id="c1", blocked_domains=["example.org"])
    verdict = safety_mediation_layer.vet_url("https://kids.safe-encyclopedia.example.org/search", policy)
    assert verdict.allowed is False


def test_voice_phishing_signal_combination_is_blocked():
    verdict = safety_mediation_layer.vet_message(
        "검찰 수사관입니다. 지금 즉시 안전 계좌로 송금하고 인증번호를 알려주세요."
    )
    assert verdict.allowed is False
    assert verdict.risk_level == "high"
    assert "기관·지인 사칭" in verdict.signals
    assert "송금·자산 요구" in verdict.signals


def test_benign_bank_notice_is_not_blocked():
    verdict = safety_mediation_layer.vet_message("은행 앱 정기점검은 오늘 밤 진행됩니다.")
    assert verdict.allowed is True


def test_allowed_domain_uses_label_boundary():
    policy = ParentPolicy(child_id="c1", allowed_domains=["microsoft.com"])
    assert safety_mediation_layer.vet_url("https://learn.microsoft.com", policy).allowed is True
    assert safety_mediation_layer.vet_url("https://evilmicrosoft.com", policy).allowed is False


def test_nested_capability_link_is_always_mediated():
    policy = ParentPolicy(child_id="c1")
    verdict = safety_mediation_layer.vet_payload(
        {"kind": "custom", "sections": [{"action": {"href": "https://bit.ly/hidden"}}]},
        policy,
    )
    assert verdict is not None
    assert verdict.allowed is False
    assert "단축 URL" in verdict.signals
