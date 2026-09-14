from app.models import ChildProfile, Intent, ParentPolicy
from app.policy.engine import permission_engine


def test_capability_outside_allowlist_is_blocked():
    profile = ChildProfile(child_id="c1", name="아이", age_group="7-9")
    policy = ParentPolicy(child_id="c1", allowed_capabilities=["calendar"])
    intent = Intent(capability="web_search", action="search", raw_text="hi")

    decision = permission_engine.evaluate(profile, policy, intent)
    assert decision.allowed is False


def test_age_gated_action_blocked_for_young_child():
    profile = ChildProfile(child_id="c1", name="아이", age_group="7-9")
    policy = ParentPolicy(child_id="c1", allowed_capabilities=["device_control"])
    intent = Intent(capability="device_control", action="wifi_toggle", raw_text="와이파이 꺼줘")

    decision = permission_engine.evaluate(profile, policy, intent)
    assert decision.allowed is False


def test_age_gated_action_allowed_for_older_child():
    profile = ChildProfile(child_id="c1", name="아이", age_group="13-15")
    policy = ParentPolicy(child_id="c1", allowed_capabilities=["device_control"])
    intent = Intent(capability="device_control", action="wifi_toggle", raw_text="와이파이 꺼줘")

    decision = permission_engine.evaluate(profile, policy, intent)
    assert decision.allowed is True
