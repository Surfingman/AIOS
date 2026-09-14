import re

from app.models import Intent

_SPLIT_PATTERN = re.compile(r"(?:,|그리고|그리고서|then|and)\s*", re.IGNORECASE)

# (capability, action, trigger keywords) - order matters, first match wins.
_CAPABILITY_RULES: list[tuple[str, str, list[str]]] = [
    ("health", "wellness_program", ["건강 프로그램", "운동 프로그램", "식단표", "운동 계획", "식단 계획", "wellness plan", "meal plan"]),
    ("calendar", "list_events", ["일정 보여", "일정 알려", "list events", "what's on my calendar"]),
    ("calendar", "add_event", ["일정 추가", "약속 잡아", "스케줄 등록", "schedule", "remind me", "약속"]),
    ("device_control", "volume_up", ["볼륨 높여", "소리 키워", "volume up", "turn up the volume"]),
    ("device_control", "volume_down", ["볼륨 낮춰", "소리 줄여", "volume down"]),
    ("device_control", "wifi_toggle", ["와이파이", "wifi"]),
    ("device_control", "brightness_set", ["밝기", "brightness"]),
    ("files", "search_file", ["파일 찾아", "파일 검색", "find file", "search file"]),
    ("files", "list_files", ["내 파일", "파일 보여", "list files", "my files"]),
    ("web_search", "search", ["검색해", "찾아줘", "search for", "google"]),
]


class IntentParser:
    """Rule-based parser. Decomposes one utterance into 1+ structured intents."""

    def parse(self, text: str) -> list[Intent]:
        segments = [s.strip() for s in _SPLIT_PATTERN.split(text) if s.strip()]
        if not segments:
            segments = [text.strip()]
        return [self._parse_segment(segment) for segment in segments if segment]

    def _parse_segment(self, segment: str) -> Intent:
        lowered = segment.lower()

        for capability, action, keywords in _CAPABILITY_RULES:
            if any(kw.lower() in lowered for kw in keywords):
                return Intent(
                    capability=capability,
                    action=action,
                    parameters=self._extract_parameters(capability, action, segment),
                    raw_text=segment,
                )

        # No rule matched: treat it as a question for the child Q&A capability.
        return Intent(capability="web_search", action="search", parameters={}, raw_text=segment)

    def _extract_parameters(self, capability: str, action: str, segment: str) -> dict:
        if capability == "files" and action == "search_file":
            match = re.search(r"['\"]([^'\"]+)['\"]", segment)
            return {"query": match.group(1) if match else segment}
        if capability == "device_control" and action == "brightness_set":
            match = re.search(r"(\d{1,3})", segment)
            return {"value": int(match.group(1))} if match else {}
        return {}


intent_parser = IntentParser()
