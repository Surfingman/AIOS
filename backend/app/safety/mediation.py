import ipaddress
import re
from typing import Any, Optional
from urllib.parse import unquote, urlparse

from app.models import ParentPolicy, SafetyVerdict

_SCAM_KEYWORDS = [
    "free-gift", "free-prize", "verify-account", "urgent-payment", "claim-now",
    "you-won", "gift-card", "무료선물", "무료 선물", "긴급결제", "계정확인", "당첨되셨습니다",
]

_SUSPICIOUS_TLDS = {".zip", ".mov", ".xyz", ".top", ".click", ".country", ".gq", ".tk"}
_URL_SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "cutt.ly", "url.kr", "han.gl"}
_URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)[^\s<>'\"]+")

_MESSAGE_SIGNAL_PATTERNS: dict[str, tuple[int, tuple[str, ...]]] = {
    "기관·지인 사칭": (2, (
        r"검찰|경찰|금융감독원|금감원|은행 직원|수사관|택배 기사|자녀(?:인데|입니다)|엄마 나|아빠 나",
        r"prosecutor|police|bank officer|fraud department|this is your (?:son|daughter)",
    )),
    "긴급성·비밀 요구": (2, (
        r"지금 즉시|긴급|오늘 안에|아무에게도 말하지|비밀로|전화 끊지 마",
        r"act now|urgent|immediately|do not tell anyone|keep this secret|stay on the line",
    )),
    "송금·자산 요구": (3, (
        r"송금|계좌 이체|안전 계좌|보호 계좌|현금 전달|상품권|기프트카드|코인|가상화폐",
        r"wire transfer|safe account|gift card|cryptocurrency|bitcoin|send money|cash courier",
    )),
    "인증·개인정보 요구": (3, (
        r"인증번호|보안카드|비밀번호|주민등록번호|카드번호|OTP|일회용 비밀번호",
        r"verification code|security code|password|social security|card number|one-time password|\botp\b",
    )),
    "원격제어 앱 요구": (4, (
        r"원격제어|화면 공유|팀뷰어|애니데스크|퀵서포트|악성 앱|앱 설치",
        r"remote access|screen share|teamviewer|anydesk|quicksupport|install (?:this|the) app",
    )),
}


def _domain_matches(host: str, domain: str) -> bool:
    normalized = domain.strip().lower().lstrip(".")
    return bool(normalized) and (host == normalized or host.endswith(f".{normalized}"))


class SafetyMediationLayer:
    """Vets any link/message a capability wants to surface to the child.

    Applied once at the orchestrator boundary so every capability is covered
    uniformly, instead of each capability re-implementing its own filter.
    """

    def vet_url(self, url: str, policy: ParentPolicy) -> SafetyVerdict:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        host = (parsed.hostname or "").lower()

        if parsed.scheme not in {"http", "https"} or not host:
            return SafetyVerdict(allowed=False, reason="지원하지 않거나 잘못된 링크 형식입니다.", risk_level="high", checked_url=url, signals=["비정상 URL"])

        if parsed.username or parsed.password:
            return SafetyVerdict(allowed=False, reason="로그인 정보를 숨긴 링크가 감지됐습니다.", risk_level="high", checked_url=url, signals=["URL 사용자정보 포함"])

        if any(_domain_matches(host, blocked) for blocked in policy.blocked_domains):
            return SafetyVerdict(allowed=False, reason="사용자 정책에서 차단한 도메인입니다.", risk_level="high", checked_url=url, signals=["차단 도메인"])

        if policy.allowed_domains and not any(_domain_matches(host, domain) for domain in policy.allowed_domains):
            return SafetyVerdict(allowed=False, reason="허용된 도메인 목록에 없습니다.", risk_level="medium", checked_url=url, signals=["허용 목록 외 도메인"])

        lowered = unquote(f"{host}{parsed.path}?{parsed.query}").lower()
        if any(k in lowered for k in _SCAM_KEYWORDS):
            return SafetyVerdict(allowed=False, reason="피싱·사기 링크 패턴이 감지됐습니다.", risk_level="high", checked_url=url, signals=["사기 키워드"])

        if any(host.endswith(tld) for tld in _SUSPICIOUS_TLDS):
            return SafetyVerdict(allowed=False, reason="위험도가 높은 도메인 형식입니다.", risk_level="medium", checked_url=url, signals=["고위험 최상위 도메인"])

        try:
            address = ipaddress.ip_address(host)
            signal = "사설 IP 링크" if not address.is_global else "IP 주소 링크"
            return SafetyVerdict(allowed=False, reason="도메인 대신 IP 주소를 사용하는 링크는 차단됩니다.", risk_level="high", checked_url=url, signals=[signal])
        except ValueError:
            pass

        if any(label.startswith("xn--") for label in host.split(".")):
            return SafetyVerdict(allowed=False, reason="문자를 위장한 도메인이 의심됩니다.", risk_level="high", checked_url=url, signals=["Punycode 도메인"])

        if host in _URL_SHORTENERS:
            return SafetyVerdict(allowed=False, reason="목적지를 숨기는 단축 링크는 확인 전 열 수 없습니다.", risk_level="medium", checked_url=url, signals=["단축 URL"])

        return SafetyVerdict(allowed=True, reason="안전한 것으로 보여요.", risk_level="none", checked_url=url)

    def vet_message(self, text: str) -> SafetyVerdict:
        normalized = " ".join((text or "").split())
        if not normalized:
            return SafetyVerdict(allowed=True, reason="검사할 내용이 없습니다.", risk_level="none")

        score = 0
        signals: list[str] = []
        for signal, (weight, patterns) in _MESSAGE_SIGNAL_PATTERNS.items():
            if any(re.search(pattern, normalized, re.IGNORECASE) for pattern in patterns):
                score += weight
                signals.append(signal)

        urls = _URL_RE.findall(normalized)
        if urls:
            signals.append("메시지 내 링크")
            score += 1

        if score >= 5 or ("기관·지인 사칭" in signals and "송금·자산 요구" in signals):
            return SafetyVerdict(
                allowed=False,
                reason="보이스피싱·메신저피싱 위험 신호가 복합적으로 감지됐습니다. 응답·송금·인증정보 제공을 중단하고 공식 연락처로 직접 확인하세요.",
                risk_level="high",
                signals=signals,
            )
        if score >= 3:
            return SafetyVerdict(
                allowed=True,
                reason="사기 가능성이 있어 주의가 필요합니다. 링크를 열거나 개인정보를 제공하기 전에 별도 채널로 확인하세요.",
                risk_level="medium",
                signals=signals,
            )
        return SafetyVerdict(allowed=True, reason="뚜렷한 사기 조합 신호는 발견되지 않았습니다.", risk_level="low" if signals else "none", signals=signals)

    def vet_payload(self, payload: Any, policy: ParentPolicy) -> Optional[SafetyVerdict]:
        texts: list[str] = []
        urls: list[str] = []

        def collect(value: Any, key: str = "") -> None:
            if isinstance(value, dict):
                for child_key, child_value in value.items():
                    collect(child_value, str(child_key).lower())
            elif isinstance(value, (list, tuple)):
                for child in value:
                    collect(child, key)
            elif isinstance(value, str):
                texts.append(value)
                if key in {"url", "href", "link", "uri"}:
                    urls.append(value)
                urls.extend(match.rstrip(".,);]}") for match in _URL_RE.findall(value))

        collect(payload)
        verdicts = [self.vet_url(url, policy) for url in dict.fromkeys(urls)]
        message_verdict = self.vet_message("\n".join(texts))
        if message_verdict.risk_level != "none":
            verdicts.append(message_verdict)
        if not verdicts:
            return None
        risk_order = {"none": 0, "low": 1, "medium": 2, "high": 3}
        return max(verdicts, key=lambda verdict: (not verdict.allowed, risk_order[verdict.risk_level]))

    def analyze(self, text: str, urls: list[str], policy: ParentPolicy) -> SafetyVerdict:
        payload = {"message": text, "urls": [{"url": url} for url in urls]}
        verdict = self.vet_payload(payload, policy)
        return verdict or SafetyVerdict(
            allowed=True,
            reason="뚜렷한 피싱·사기 위험 신호는 발견되지 않았습니다.",
            risk_level="none",
        )


safety_mediation_layer = SafetyMediationLayer()
