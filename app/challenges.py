from __future__ import annotations

import re

# Interstitial wording that is essentially never present on a real product page,
# so it identifies a bot wall regardless of the HTTP status code (some walls are
# served with a 200).
STRONG_CHALLENGE_PATTERNS = [
    r"cf-challenge",
    r"attention required",
    r"verify you are human",
    r"checking your browser",
    r"bot detection",
    r"unusual traffic",
    r"access denied",
    r"akamai",
    r"perimeterx",
]

# Generic vendor/keyword hits that legitimately appear on benign pages (e.g. a
# "DDoS protection by Cloudflare" footer, a CDN script URL, or a product whose
# copy mentions "captcha"). These only indicate a challenge when paired with a
# blocking HTTP status, so a 200 product page that merely name-drops them is not
# parked in cooldown.
VENDOR_CHALLENGE_PATTERNS = [
    r"captcha",
    r"cloudflare",
]

BLOCKING_STATUS = {403, 429, 503}


def is_challenge_response(
    status_code: int | None, content: str, headers: dict[str, str] | None = None
) -> bool:
    lowered = content[:5000].lower()
    if any(re.search(pattern, lowered) for pattern in STRONG_CHALLENGE_PATTERNS):
        return True

    blocking = status_code in BLOCKING_STATUS
    if blocking and any(re.search(pattern, lowered) for pattern in VENDOR_CHALLENGE_PATTERNS):
        return True

    headers = {key.lower(): value.lower() for key, value in (headers or {}).items()}
    if "cloudflare" in headers.get("server", "") and blocking:
        return True
    return False
