from __future__ import annotations

import re

CHALLENGE_PATTERNS = [
    r"captcha",
    r"cf-challenge",
    r"cloudflare",
    r"attention required",
    r"verify you are human",
    r"checking your browser",
    r"bot detection",
    r"unusual traffic",
    r"access denied",
    r"akamai",
    r"perimeterx",
]


def is_challenge_response(
    status_code: int | None, content: str, headers: dict[str, str] | None = None
) -> bool:
    if status_code in {403, 429, 503}:
        lowered = content[:5000].lower()
        if any(re.search(pattern, lowered) for pattern in CHALLENGE_PATTERNS):
            return True
    headers = {key.lower(): value.lower() for key, value in (headers or {}).items()}
    server = headers.get("server", "")
    if "cloudflare" in server and status_code in {403, 429, 503}:
        return True
    lowered = content[:5000].lower()
    return any(re.search(pattern, lowered) for pattern in CHALLENGE_PATTERNS)
