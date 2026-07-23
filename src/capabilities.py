"""Capability Registry

In an AI-native OS, "apps" are replaced by registered Capabilities: small,
composable units of functionality that the Agent Orchestrator can invoke.

Each capability declares:
 - name
 - required permissions
 - an `execute(slots, context)` function returning a UI "card" dict
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta


def calendar_capability(slots: dict, context) -> dict:
    """Mock calendar agent: creates a meeting card."""
    time_hint = slots.get("time", "내일 오후 3시")
    title = slots.get("title", "팀 회의")
    return {
        "capability": "calendar",
        "title": f"📅 일정 생성: {title}",
        "body": f"'{title}' 일정을 {time_hint}에 생성했습니다.",
        "actions": ["수정", "취소", "참석자 추가"],
        "permissions_used": ["calendar:write"],
    }


def web_search_capability(slots: dict, context) -> dict:
    """Mock web search agent: returns fake search summary."""
    query = slots.get("query", "관련 자료")
    fake_results = [
        f"{query} 관련 최신 보고서 (예시 링크 #1)",
        f"{query} 요약 문서 (예시 링크 #2)",
    ]
    return {
        "capability": "web_search",
        "title": f"🔎 검색 결과: {query}",
        "body": "\n".join(fake_results),
        "actions": ["더보기", "회의 카드에 첨부"],
        "permissions_used": ["network:read"],
    }


def device_control_capability(slots: dict, context) -> dict:
    """Mock smart-device control agent."""
    device = slots.get("device", "거실 조명")
    action = slots.get("action", "켜기")
    return {
        "capability": "device_control",
        "title": f"💡 기기 제어: {device}",
        "body": f"'{device}'을(를) '{action}' 상태로 변경했습니다.",
        "actions": ["되돌리기"],
        "permissions_used": ["device:control"],
    }


def files_capability(slots: dict, context) -> dict:
    """Mock file agent: finds/lists files."""
    keyword = slots.get("keyword", "보고서")
    fake_files = [f"{keyword}_2026_v{n}.docx" for n in random.sample(range(1, 9), 2)]
    return {
        "capability": "files",
        "title": f"📁 파일 검색: {keyword}",
        "body": "\n".join(fake_files),
        "actions": ["열기", "공유"],
        "permissions_used": ["files:read"],
    }


# Capability Registry: name -> (keywords for routing, executor fn)
CAPABILITY_REGISTRY = {
    "calendar": {
        "keywords": ["회의", "일정", "미팅", "약속"],
        "executor": calendar_capability,
    },
    "web_search": {
        "keywords": ["검색", "찾아", "자료", "알아봐"],
        "executor": web_search_capability,
    },
    "device_control": {
        "keywords": ["조명", "에어컨", "켜", "꺼", "온도"],
        "executor": device_control_capability,
    },
    "files": {
        "keywords": ["파일", "문서", "보고서"],
        "executor": files_capability,
    },
}
