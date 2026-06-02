from app.rules import evaluate_rule, evaluate_rule_diagnostics


def test_css_selector_text_contains() -> None:
    result = evaluate_rule(
        "css", ".availability", "contains", "in stock", "<p class='availability'>In Stock Now</p>"
    )

    assert result.matched is True
    assert "In Stock" in result.evidence


def test_css_selector_attribute_exists() -> None:
    result = evaluate_rule(
        "css",
        "button.buy::attr(data-state)",
        "equals",
        "available",
        "<button class='buy' data-state='available'>Buy</button>",
    )

    assert result.matched is True


def test_text_regex_invalid_reports_evidence() -> None:
    result = evaluate_rule("text", "", "regex", "[", "in stock")

    assert result.matched is False
    assert "Invalid regex" in result.evidence


def test_text_rule_can_scope_match_to_css_selector_text() -> None:
    html = """
    <section class="summary">Sold out</section>
    <section class="availability">In Stock Now</section>
    """

    result = evaluate_rule("text", ".availability", "contains", "in stock", html)

    assert result.matched is True
    assert "In Stock Now" in result.evidence
    assert "Sold out" not in result.evidence


def test_text_rule_scope_excludes_text_outside_selector() -> None:
    html = """
    <section class="summary">In Stock Now</section>
    <section class="availability">Sold out</section>
    """

    result = evaluate_rule("text", ".availability", "contains", "in stock", html)

    assert result.matched is False
    assert "Sold out" in result.evidence
    assert "In Stock Now" not in result.evidence


def test_text_rule_body_ignores_script_and_tag_markup() -> None:
    # "in stock" appears only inside a <script> blob and a data attribute, never
    # in the visible text. The live check strips those, so the Test-rule path
    # (evaluate_rule) must agree and report no match.
    html = (
        "<html><head><script>var avail = 'in stock';</script></head>"
        "<body><div data-availability='in stock'></div>"
        "<p>Currently sold out</p></body></html>"
    )

    result = evaluate_rule("text", "", "contains", "in stock", html, "text/html")
    diagnostics = evaluate_rule_diagnostics(
        "text", "", "contains", "in stock", html, "text/html"
    )

    assert result.matched is False
    assert result.matched == diagnostics.matched
    assert "in stock" not in result.evidence.lower()


def test_text_rule_body_matches_visible_text() -> None:
    html = "<html><body><script>nope</script><p>In Stock Now</p></body></html>"

    result = evaluate_rule("text", "", "contains", "in stock", html, "text/html")
    diagnostics = evaluate_rule_diagnostics(
        "text", "", "contains", "in stock", html, "text/html"
    )

    assert result.matched is True
    assert result.matched == diagnostics.matched
    assert "In Stock Now" in result.evidence


def test_invalid_css_selector_reports_evidence() -> None:
    result = evaluate_rule("css", "div[", "exists", "", "<div>In stock</div>")

    assert result.matched is False
    assert "Invalid CSS selector" in result.evidence


def test_rule_diagnostics_explains_css_regex_failure() -> None:
    html = "<main><button class='buy' data-state='disabled'>Sold out</button></main>"

    result = evaluate_rule_diagnostics(
        "css", "button.buy", "regex", "add to cart", html, "text/html"
    )

    assert result.matched is False
    assert result.element_count == 1
    assert result.elements[0].tag == "button"
    assert result.elements[0].text == "Sold out"
    assert result.regex is not None
    assert result.regex.valid is True
    assert result.regex.match_count == 0
    assert "did not match" in result.reason


def test_rule_diagnostics_centers_text_evidence_on_late_contains_match() -> None:
    prefix = "IRRELEVANT_START " + ("Navigation Menu " * 500)
    html = f"<main>{prefix}<section>Ships today. In Stock Now for pickup.</section></main>"

    result = evaluate_rule_diagnostics("text", "", "contains", "in stock now", html, "text/html")

    assert result.matched is True
    assert result.reason == "Extracted text contains the operand."
    assert result.match_contexts
    assert "In Stock Now" in result.evidence
    assert "In Stock Now" in result.extracted_text
    assert "In Stock Now" in result.match_contexts[0]
    assert "IRRELEVANT_START" not in result.evidence
    assert result.extracted_text_is_excerpt is True
    assert result.extracted_text_length > len(result.extracted_text)


def test_rule_diagnostics_centers_regex_context_on_late_match() -> None:
    prefix = "IRRELEVANT_START " + ("Navigation Menu " * 500)
    html = f"<main>{prefix}<section>Status: In Stock Now for pickup.</section></main>"

    result = evaluate_rule_diagnostics("text", "", "regex", r"in\s+stock\s+now", html, "text/html")

    assert result.matched is True
    assert result.regex is not None
    assert result.regex.match_count == 1
    assert result.match_contexts
    assert "In Stock Now" in result.evidence
    assert "In Stock Now" in result.extracted_text
    assert "In Stock Now" in result.match_contexts[0]
    assert "IRRELEVANT_START" not in result.evidence
