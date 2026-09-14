from app.capabilities.base import capability_registry
from app.memory.store import SessionState
from app.models import Intent

_QNA_STEPS: dict[str, list[dict[str, str]]] = {
    "volcano": [
        {"emoji": "🌋", "text": "화산은 땅속 마그마가 모여있는 곳이에요."},
        {"emoji": "🔥", "text": "압력이 쌓이면 마그마가 위로 밀려 올라와요."},
        {"emoji": "💥", "text": "압력이 너무 커지면 화산이 분출해요."},
        {"emoji": "🌫️", "text": "용암과 화산재가 밖으로 나오면서 새로운 땅을 만들어요."},
    ],
    "math": [
        {"emoji": "📖", "text": "문제에서 무엇을 구하는지 먼저 읽어봐요."},
        {"emoji": "✏️", "text": "필요한 숫자와 연산을 순서대로 적어봐요."},
        {"emoji": "🧮", "text": "한 단계씩 계산해요."},
        {"emoji": "✅", "text": "답을 문제에 다시 넣어 맞는지 확인해요."},
    ],
}

_QNA_TRIGGERS = {"volcano": ["화산", "volcano"], "math": ["수학", "math", "문제"]}
_SCAM_QUERY_KEYWORDS = ["공짜", "무료 선물", "free gift", "당첨"]


def _match_topic(text: str) -> str | None:
    for topic, keywords in _QNA_TRIGGERS.items():
        if any(k in text for k in keywords):
            return topic
    return None


class WebSearchCapability:
    id = "web_search"

    def execute(self, intent: Intent, session: SessionState) -> dict:
        topic = _match_topic(intent.raw_text)
        if topic:
            return {
                "title": "그림으로 알아보기",
                "kind": "step_by_step",
                "steps": _QNA_STEPS[topic],
            }

        query = intent.raw_text
        # Demo hook: a "scam-ish" query yields a scam-ish mock result so the
        # safety mediation layer downstream has something real to catch.
        if any(k in query for k in _SCAM_QUERY_KEYWORDS):
            url = "free-gift-claim-now.xyz/verify-account"
        else:
            url = "kids.safe-encyclopedia.example.org/search"

        return {
            "title": f"'{query}' 검색 결과",
            "kind": "search_results",
            "results": [{"label": f"검색 결과 - {query}", "url": url}],
        }


capability_registry.register(WebSearchCapability())
