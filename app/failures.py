from __future__ import annotations

import asyncio
import socket
from collections.abc import Iterator

from app.models import ERROR_DNS, ERROR_GENERIC, ERROR_TIMEOUT

DNS_MARKERS = (
    "err_name_not_resolved",
    "dns_probe_finished_nxdomain",
    "getaddrinfo",
    "name or service not known",
    "nodename nor servname",
    "temporary failure in name resolution",
    "eai_again",
    "enotfound",
)

TIMEOUT_MARKERS = (
    "timeout",
    "timed out",
    "etimedout",
)


def classify_exception(exc: BaseException) -> str:
    messages = " ".join(_exception_messages(exc)).lower()
    if _has_exception_type(exc, socket.gaierror) or any(
        marker in messages for marker in DNS_MARKERS
    ):
        return ERROR_DNS
    if _has_exception_type(exc, TimeoutError, asyncio.TimeoutError) or any(
        marker in messages for marker in TIMEOUT_MARKERS
    ):
        return ERROR_TIMEOUT
    return ERROR_GENERIC


def _exception_messages(exc: BaseException) -> Iterator[str]:
    current: BaseException | None = exc
    seen: set[int] = set()
    while current and id(current) not in seen:
        seen.add(id(current))
        yield type(current).__name__
        yield str(current)
        current = current.__cause__ or current.__context__


def _has_exception_type(exc: BaseException, *types: type[BaseException]) -> bool:
    current: BaseException | None = exc
    seen: set[int] = set()
    while current and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, types):
            return True
        current = current.__cause__ or current.__context__
    return False
