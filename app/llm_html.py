"""Clean and truncate product-page HTML so it fits inside an LLM prompt.

Used by ``app.llm`` before sending a page snapshot to the model. Scripts are
stripped EXCEPT ``<script type="application/ld+json">`` blocks, which carry
schema.org structured data — often the cleanest stock signal on a product page.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup

# Fallback cap when no per-request limit is supplied. Production callers pass
# settings.llm_html_char_limit explicitly so this is mostly relevant for tests
# and ad-hoc imports of prepare_html_for_llm.
HTML_LIMIT = 200_000


def prepare_html_for_llm(content: str, limit: int = HTML_LIMIT) -> str:
    """Strip noisy nodes from HTML and truncate so it fits in an LLM prompt.

    Scripts are removed EXCEPT for `<script type="application/ld+json">` blocks,
    which carry schema.org structured data (often the cleanest signal for stock
    availability on product pages).
    """
    if not content:
        return ""
    from bs4 import Comment

    try:
        soup = BeautifulSoup(content, "html.parser")
    except Exception:
        return _truncate(content, limit)
    for tag in soup.find_all("script"):
        type_attr = tag.get("type")
        type_str = type_attr if isinstance(type_attr, str) else ""
        if type_str.strip().lower() != "application/ld+json":
            tag.decompose()
    for tag in soup(["style", "noscript", "svg", "iframe", "template", "link", "meta", "path"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda value: isinstance(value, Comment)):
        comment.extract()
    serialized = str(soup)
    serialized = re.sub(r"\s+", " ", serialized).strip()
    return _truncate(serialized, limit)


def _truncate(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + "..."
