from app.models import ChildProfile, Intent, ParentPolicy, PolicyDecision

# Actions sensitive enough to require an older age group even when the parent
# capability allow-list already permits the capability itself.
_AGE_GATED_ACTIONS: dict[str, set[str]] = {
    "device_control": {"wifi_toggle"},
}

_MIN_AGE_GROUP_FOR_GATED_ACTION = "10-12"
_AGE_ORDER = {"7-9": 0, "10-12": 1, "13-15": 2, "adult": 3}


class PermissionEngine:
    """Parent-authored policy, evaluated *before* a capability ever executes."""

    def evaluate(self, profile: ChildProfile, policy: ParentPolicy, intent: Intent) -> PolicyDecision:
        if intent.capability not in policy.allowed_capabilities:
            return PolicyDecision(
                allowed=False,
                reason=f"'{intent.capability}'는 부모님이 허용한 목록에 없어요.",
            )

        gated_actions = _AGE_GATED_ACTIONS.get(intent.capability, set())
        if intent.action in gated_actions and _AGE_ORDER[profile.age_group] < _AGE_ORDER[_MIN_AGE_GROUP_FOR_GATED_ACTION]:
            return PolicyDecision(
                allowed=False,
                reason=f"'{intent.action}'은 {_MIN_AGE_GROUP_FOR_GATED_ACTION} 연령대부터 가능해요.",
            )

        return PolicyDecision(allowed=True, reason="allowed")


permission_engine = PermissionEngine()
