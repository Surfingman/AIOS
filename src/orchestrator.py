"""Agent Orchestrator (the "AI Kernel")

Responsible for:
 1. Intent parsing (very small rule-based NLU standing in for an LLM planner)
 2. Task decomposition into one-or-more capability calls
 3. Policy / permission check before executing a capability
 4. Scheduling capability execution and collecting resulting UI cards
"""
from __future__ import annotations

import re
import uuid

from capabilities import CAPABILITY_REGISTRY
from context_store import ContextStore

# Permissions the "user" has granted to the OS (mocked policy store).
GRANTED_PERMISSIONS = {
    "calendar:write",
    "network:read",
    "device:control",
    "files:read",
}


class PermissionDenied(Exception):
    pass


def parse_intent(text: str) -> list[str]:
    """Very small stand-in for an LLM-based intent classifier.

    Splits a compound request on connectors like "고" / "," and matches
    each clause against capability keywords.
    """
    clauses = re.split(r"[,，]|고\s|하고\s", text)
    matched: list[str] = []
    for clause in clauses:
        for cap_name, cap in CAPABILITY_REGISTRY.items():
            if any(kw in clause for kw in cap["keywords"]):
                if cap_name not in matched:
                    matched.append(cap_name)
    return matched


def extract_slots(cap_name: str, text: str) -> dict:
    """Naive slot extraction per capability (regex-based, LLM would do this properly)."""
    slots: dict = {}
    if cap_name == "calendar":
        time_match = re.search(r"(내일|오늘|모레)?\s*(오전|오후)?\s*\d{1,2}시", text)
        if time_match:
            slots["time"] = time_match.group(0)
        title_match = re.search(r"(팀\s*회의|회의|미팅)", text)
        if title_match:
            slots["title"] = title_match.group(0)
    elif cap_name == "web_search":
        # Try specific known phrases first, then fall back to "everything
        # before the trigger verb" so unmatched free text still yields a
        # reasonable query.
        specific = re.search(r"(관련\s*자료|자료)", text)
        if specific:
            slots["query"] = specific.group(0)
        else:
            fallback = re.search(r".+?(?=찾아|검색)", text)
            if fallback:
                slots["query"] = fallback.group(0).strip(" ,，")
    elif cap_name == "device_control":
        device_match = re.search(r"(거실\s*조명|조명|에어컨)", text)
        action_match = re.search(r"(켜|꺼)", text)
        if device_match:
            slots["device"] = device_match.group(0)
        if action_match:
            slots["action"] = "켜기" if action_match.group(0) == "켜" else "끄기"
    elif cap_name == "files":
        kw = re.search(r"(보고서|문서)", text)
        if kw:
            slots["keyword"] = kw.group(0)
    return slots


class AgentOrchestrator:
    """The AI Kernel: routes an intent to capabilities, enforces policy,
    and returns UI cards for the Adaptive UI Layer to render."""

    def __init__(self, context_store: ContextStore):
        self.context_store = context_store

    def handle_intent(self, session_id: str, text: str) -> dict:
        session = self.context_store.get_session(session_id)
        session.add_turn("user", text)

        matched_caps = parse_intent(text)
        if not matched_caps:
            card = {
                "capability": "none",
                "title": "🤔 이해하지 못했어요",
                "body": "다른 방식으로 다시 말씀해 주시겠어요?",
                "actions": [],
                "permissions_used": [],
            }
            session.add_turn("system", card["body"])
            return {"request_id": str(uuid.uuid4()), "cards": [card]}

        cards = []
        for cap_name in matched_caps:
            cap = CAPABILITY_REGISTRY[cap_name]
            slots = extract_slots(cap_name, text)
            try:
                card = self._execute_with_policy(cap_name, cap, slots)
            except PermissionDenied as e:
                card = {
                    "capability": cap_name,
                    "title": "🚫 권한 거부",
                    "body": str(e),
                    "actions": ["권한 요청"],
                    "permissions_used": [],
                }
            cards.append(card)
            session.add_turn("system", card["body"])

        return {"request_id": str(uuid.uuid4()), "cards": cards}

    def _execute_with_policy(self, cap_name: str, cap: dict, slots: dict) -> dict:
        card = cap["executor"](slots, self.context_store)
        required = set(card.get("permissions_used", []))
        if not required.issubset(GRANTED_PERMISSIONS):
            missing = required - GRANTED_PERMISSIONS
            raise PermissionDenied(f"'{cap_name}' 실행에 필요한 권한이 없습니다: {missing}")
        return card
