from __future__ import annotations

from app.llm import HTML_LIMIT, prepare_html_for_llm


def test_default_limit_is_generous_enough_for_real_product_pages() -> None:
    # 16k was the old cap; modern product pages routinely exceed it. The new default
    # must comfortably fit a typical e-commerce page so users stop hitting "the page
    # was heavily truncated" responses from the LLM.
    assert HTML_LIMIT >= 100_000


def test_preserves_jsonld_script_block() -> None:
    html = """
    <html>
      <head>
        <script>window.__INITIAL_STATE__ = {large: 'noise'};</script>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Product",
           "offers":{"availability":"https://schema.org/InStock"}}
        </script>
      </head>
      <body><h1>Widget</h1></body>
    </html>
    """

    cleaned = prepare_html_for_llm(html)

    assert "application/ld+json" in cleaned
    assert "schema.org/InStock" in cleaned
    # Non-LD scripts still get stripped.
    assert "__INITIAL_STATE__" not in cleaned


def test_preserves_jsonld_with_quoted_uppercase_type() -> None:
    html = (
        "<html><body>"
        '<script type="Application/LD+JSON">{"availability":"OutOfStock"}</script>'
        "</body></html>"
    )

    cleaned = prepare_html_for_llm(html)

    assert "OutOfStock" in cleaned


def test_respects_custom_limit() -> None:
    html = "<html><body>" + ("x" * 5_000) + "</body></html>"

    cleaned = prepare_html_for_llm(html, limit=1_000)

    assert len(cleaned) <= 1_000 + len("...")
    assert cleaned.endswith("...")


def test_empty_input_returns_empty_string() -> None:
    assert prepare_html_for_llm("") == ""
    assert prepare_html_for_llm("", limit=10) == ""


def test_strips_styles_and_comments_but_keeps_visible_text() -> None:
    html = """
    <html>
      <head><style>.x{color:red}</style></head>
      <body>
        <!-- tracking pixel -->
        <p>Stock: 3 left</p>
      </body>
    </html>
    """

    cleaned = prepare_html_for_llm(html)

    assert "Stock: 3 left" in cleaned
    assert "color:red" not in cleaned
    assert "tracking pixel" not in cleaned
