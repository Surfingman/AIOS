import re
from datetime import datetime, timedelta

from app.capabilities.base import capability_registry
from app.memory.store import SessionState
from app.models import Intent

_DAY_WORDS = {"오늘": 0, "내일": 1, "모레": 2, "today": 0, "tomorrow": 1}


def _guess_date(text: str) -> str:
    for word, offset in _DAY_WORDS.items():
        if word in text:
            return (datetime.now() + timedelta(days=offset)).strftime("%Y-%m-%d")
    return datetime.now().strftime("%Y-%m-%d")


def _guess_time(text: str) -> str:
    match = re.search(r"(오전|오후)?\s*(\d{1,2})\s*시", text)
    if not match:
        return "시간 미정"
    period, hour = match.group(1), int(match.group(2))
    if period == "오후" and hour < 12:
        hour += 12
    return f"{hour:02d}:00"


class CalendarCapability:
    id = "calendar"

    def execute(self, intent: Intent, session: SessionState) -> dict:
        if intent.action == "list_events":
            return {
                "title": "다가오는 일정",
                "kind": "list",
                "items": session.calendar_events or [{"date": "-", "time": "-", "title": "예정된 일정이 없어요"}],
            }

        event = {
            "date": _guess_date(intent.raw_text),
            "time": _guess_time(intent.raw_text),
            "title": intent.parameters.get("title") or intent.raw_text,
        }
        session.calendar_events.append(event)
        return {
            "title": "일정을 추가했어요",
            "kind": "event_created",
            "event": event,
        }


capability_registry.register(CalendarCapability())
