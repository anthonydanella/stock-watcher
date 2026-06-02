from app.challenges import is_challenge_response


def test_detects_challenge_on_403_with_cloudflare_body() -> None:
    assert is_challenge_response(403, "Attention required! Cloudflare", {}) is True


def test_detects_challenge_on_503_with_captcha_body() -> None:
    assert is_challenge_response(503, "Please complete the CAPTCHA", {}) is True


def test_detects_challenge_from_cloudflare_server_header() -> None:
    assert is_challenge_response(429, "irrelevant", {"server": "cloudflare"}) is True


def test_detects_unusual_traffic_on_200_response() -> None:
    body = "Our systems have detected unusual traffic from your computer network."
    assert is_challenge_response(200, body, {}) is True


def test_detects_access_denied_on_200_response() -> None:
    assert is_challenge_response(200, "Access Denied — you do not have permission", {}) is True


def test_detects_akamai_on_200_response() -> None:
    assert is_challenge_response(200, "Powered by Akamai Bot Manager", {}) is True


def test_detects_perimeterx_on_200_response() -> None:
    assert is_challenge_response(200, "PerimeterX human verification", {}) is True


def test_ignores_benign_product_page() -> None:
    assert is_challenge_response(200, "Add to cart — in stock", {}) is False


def test_ignores_cloudflare_mention_on_200_response() -> None:
    body = "In stock — Add to cart. DDoS protection by Cloudflare. <script src='cloudflare.com'>"
    assert is_challenge_response(200, body, {}) is False


def test_ignores_captcha_mention_on_200_response() -> None:
    body = "CAPTCHA Solver Pro — 500 in stock. Add to cart."
    assert is_challenge_response(200, body, {}) is False


def test_detects_cloudflare_keyword_on_blocking_status() -> None:
    assert is_challenge_response(503, "cloudflare", {}) is True


def test_ignores_missing_status_with_benign_body() -> None:
    assert is_challenge_response(None, "Add to cart", {}) is False
