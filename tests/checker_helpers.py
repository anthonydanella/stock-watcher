from pathlib import Path

from app.checker import FetchResult, StockChecker
from app.config import Settings
from app.db import connect, init_db
from app.models import Monitor
from app.repository import Repository


class FakeNtfy:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    async def send(self, settings, monitor, title, message, tags="package") -> bool:  # noqa: ANN001
        self.messages.append((title, message))
        return True


class BrokenNtfy:
    async def send(self, settings, monitor, title, message, tags="package") -> bool:  # noqa: ANN001
        raise RuntimeError("ntfy is unavailable")


class RejectingNtfy:
    async def send(self, settings, monitor, title, message, tags="package") -> bool:  # noqa: ANN001
        return False


class FakeChecker(StockChecker):
    def __init__(self, repo: Repository, settings: Settings, ntfy: FakeNtfy, result: FetchResult):
        super().__init__(repo, settings, ntfy)
        self.result = result

    async def fetch(self, monitor: Monitor) -> FetchResult:
        return self.result


class FailingChecker(StockChecker):
    def __init__(
        self,
        repo: Repository,
        settings: Settings,
        ntfy: FakeNtfy,
        exc: Exception | None = None,
    ):
        super().__init__(repo, settings, ntfy)
        self.exc = exc or RuntimeError("browser checks are disabled")

    async def fetch(self, monitor: Monitor) -> FetchResult:
        raise self.exc


class BrowserModeChecker(StockChecker):
    def __init__(
        self,
        repo: Repository,
        settings: Settings,
        ntfy: FakeNtfy,
        browser_result: FetchResult,
    ):
        super().__init__(repo, settings, ntfy)
        self.browser_result = browser_result
        self.browser_fetches = 0

    async def _fetch_browser(self, monitor: Monitor) -> FetchResult:
        self.browser_fetches += 1
        return self.browser_result


class DummyPage:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.scripts: list[str] = []

    async def evaluate(self, script: str) -> None:
        self.scripts.append(script)
        if self.fail:
            raise RuntimeError("blocked")


def settings(tmp_path: Path, *, llm_api_key: str = "") -> Settings:
    return Settings(
        data_dir=tmp_path,
        database_path=tmp_path / "test.sqlite3",
        timezone="UTC",
        check_loop_interval_seconds=60,
        event_retention_limit=100,
        attempt_retention_limit=5000,
        default_ntfy_server="https://ntfy.sh",
        default_ntfy_topic="",
        llm_api_key=llm_api_key,
        llm_html_char_limit=200_000,
    )


def repo(tmp_path: Path) -> Repository:
    test_settings = settings(tmp_path)
    conn = connect(test_settings.database_path)
    init_db(conn)
    return Repository(conn, test_settings)


def make_monitor() -> Monitor:
    return Monitor(
        id=None,
        name="Console",
        url="https://example.com/console",
        enabled=True,
        check_mode="browser",
        interval_seconds=900,
        jitter_percent=0,
        rule_type="css",
        selector_or_path=".stock",
        match_mode="contains",
        match_value="available",
        user_agent_mode="random",
        timeout_seconds=10,
    )
