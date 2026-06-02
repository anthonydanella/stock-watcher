import importlib
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.models import (
    STATUS_ERROR,
    STATUS_IN_STOCK,
    STATUS_OUT_OF_STOCK,
    AppSettings,
    Monitor,
    NotificationRule,
    utcnow,
)
from app.notification_rules import evaluate_rule, evaluate_rules


class FakeNtfy:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str, str]] = []

    async def send(self, settings, monitor, title, message, tags="package") -> bool:  # noqa: ANN001
        self.messages.append((title, message, tags))
        return True


def load_app(monkeypatch, tmp_path):  # noqa: ANN001
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import app.config

    importlib.reload(app.config)
    import app.main

    return importlib.reload(app.main).app


def _make_monitor(monitor_id: int, name: str, status: str) -> Monitor:
    return Monitor(
        id=monitor_id,
        name=name,
        url=f"https://example.com/{monitor_id}",
        enabled=True,
        check_mode="browser",
        interval_seconds=900,
        jitter_percent=0,
        rule_type="text",
        selector_or_path="",
        match_mode="contains",
        match_value="",
        user_agent_mode="random",
        timeout_seconds=20,
        status=status,
    )


def test_evaluate_rule_counts_matching_monitors() -> None:
    monitors = [
        _make_monitor(1, "A", STATUS_IN_STOCK),
        _make_monitor(2, "B", STATUS_IN_STOCK),
        _make_monitor(3, "C", STATUS_OUT_OF_STOCK),
    ]
    rule = NotificationRule(
        id=1,
        name="Two in stock",
        enabled=True,
        monitor_ids=[],
        trigger_statuses=["in_stock"],
        threshold=2,
        cooldown_minutes=0,
    )

    result = evaluate_rule(rule, monitors)

    assert result.satisfied is True
    assert set(result.matching_monitor_ids) == {1, 2}


def test_evaluate_rule_respects_monitor_scope() -> None:
    monitors = [
        _make_monitor(1, "A", STATUS_IN_STOCK),
        _make_monitor(2, "B", STATUS_IN_STOCK),
        _make_monitor(3, "C", STATUS_IN_STOCK),
    ]
    rule = NotificationRule(
        id=1,
        name="A or B in stock",
        enabled=True,
        monitor_ids=[1, 2],
        trigger_statuses=["in_stock"],
        threshold=2,
        cooldown_minutes=0,
    )

    result = evaluate_rule(rule, monitors)

    assert result.satisfied is True
    assert set(result.matching_monitor_ids) == {1, 2}


def test_evaluate_rule_below_threshold() -> None:
    monitors = [
        _make_monitor(1, "A", STATUS_IN_STOCK),
        _make_monitor(2, "B", STATUS_OUT_OF_STOCK),
    ]
    rule = NotificationRule(
        id=1,
        name="Two in stock",
        enabled=True,
        monitor_ids=[],
        trigger_statuses=["in_stock"],
        threshold=2,
        cooldown_minutes=0,
    )

    result = evaluate_rule(rule, monitors)

    assert result.satisfied is False
    assert result.matching_monitor_ids == [1]


def test_rule_crud_endpoints(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    monitor = client.post(
        "/api/monitors",
        json={"name": "GPU", "url": "https://example.com/gpu"},
    ).json()

    created = client.post(
        "/api/notification-rules",
        json={
            "name": "GPU is back",
            "enabled": True,
            "monitor_ids": [monitor["id"]],
            "trigger_statuses": ["in_stock"],
            "threshold": 1,
            "cooldown_minutes": 30,
        },
    )
    assert created.status_code == 201
    rule = created.json()
    assert rule["name"] == "GPU is back"
    assert rule["monitor_ids"] == [monitor["id"]]
    assert rule["trigger_statuses"] == ["in_stock"]
    assert rule["currently_satisfied"] is False
    assert rule["current_matching_count"] == 0

    listed = client.get("/api/notification-rules").json()
    assert len(listed) == 1
    assert listed[0]["id"] == rule["id"]

    updated = client.put(
        f"/api/notification-rules/{rule['id']}",
        json={
            "name": "GPU watcher",
            "enabled": False,
            "monitor_ids": [],
            "trigger_statuses": ["in_stock", "low_stock"],
            "threshold": 2,
            "cooldown_minutes": 5,
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "GPU watcher"
    assert body["enabled"] is False
    assert body["monitor_ids"] == []
    assert body["trigger_statuses"] == ["in_stock", "low_stock"]
    assert body["threshold"] == 2

    deleted = client.delete(f"/api/notification-rules/{rule['id']}")
    assert deleted.status_code == 204
    assert client.get("/api/notification-rules").json() == []


def test_rule_payload_rejects_unknown_status(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/notification-rules",
        json={
            "name": "Bad status",
            "trigger_statuses": ["banana"],
        },
    )
    assert response.status_code == 422


def test_rule_payload_rejects_blank_name(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/notification-rules",
        json={"name": "   ", "trigger_statuses": ["in_stock"]},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_evaluate_rules_fires_on_transition(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    repo = main_module.repo
    client = TestClient(app)

    monitor_a = client.post(
        "/api/monitors", json={"name": "A", "url": "https://example.com/a"}
    ).json()
    monitor_b = client.post(
        "/api/monitors", json={"name": "B", "url": "https://example.com/b"}
    ).json()

    repo.update_monitor(monitor_a["id"], {"status": STATUS_IN_STOCK})
    repo.update_monitor(monitor_b["id"], {"status": STATUS_IN_STOCK})

    rule = NotificationRule(
        id=None,
        name="Two in stock",
        enabled=True,
        monitor_ids=[],
        trigger_statuses=["in_stock"],
        threshold=2,
        cooldown_minutes=60,
    )
    rule_id = repo.create_notification_rule(rule)

    ntfy = FakeNtfy()
    app_settings = AppSettings(
        ntfy_enabled=True,
        ntfy_server="https://ntfy.sh",
        ntfy_topic="alerts",
        ntfy_token="",
        ntfy_priority="default",
    )

    await evaluate_rules(repo, app_settings, ntfy.send)

    assert len(ntfy.messages) == 1
    title, message, tags = ntfy.messages[0]
    assert "Two in stock" in title
    assert "in stock" in message
    assert tags == "bell"

    # Second call with same state should not fire again.
    await evaluate_rules(repo, app_settings, ntfy.send)
    assert len(ntfy.messages) == 1

    stored = repo.get_notification_rule(rule_id)
    assert stored is not None
    assert stored.last_satisfied is True
    assert stored.last_triggered_at is not None


@pytest.mark.asyncio
async def test_evaluate_rules_cooldown_blocks_refire(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    repo = main_module.repo
    client = TestClient(app)
    monitor = client.post(
        "/api/monitors", json={"name": "A", "url": "https://example.com/a"}
    ).json()

    rule_id = repo.create_notification_rule(
        NotificationRule(
            id=None,
            name="Stock alert",
            enabled=True,
            monitor_ids=[monitor["id"]],
            trigger_statuses=["in_stock"],
            threshold=1,
            cooldown_minutes=60,
        )
    )
    # Simulate a recent trigger that satisfied the rule, then dropped back.
    recent = utcnow() - timedelta(minutes=5)
    repo.update_notification_rule_state(rule_id, last_satisfied=False, last_triggered_at=recent)

    repo.update_monitor(monitor["id"], {"status": STATUS_IN_STOCK})
    ntfy = FakeNtfy()
    app_settings = AppSettings(True, "https://ntfy.sh", "alerts", "", "default")

    await evaluate_rules(repo, app_settings, ntfy.send)

    # Cooldown of 60 minutes is still active, so no notification yet.
    assert ntfy.messages == []
    stored = repo.get_notification_rule(rule_id)
    assert stored is not None
    # The rise stays pending (unacknowledged) so it can fire once cooldown ends,
    # rather than being silently dropped.
    assert stored.last_satisfied is False

    # Once the cooldown window elapses, the deferred alert fires (still in stock).
    repo.update_notification_rule_state(
        rule_id, last_satisfied=False, last_triggered_at=utcnow() - timedelta(minutes=61)
    )
    await evaluate_rules(repo, app_settings, ntfy.send)

    assert len(ntfy.messages) == 1
    stored = repo.get_notification_rule(rule_id)
    assert stored is not None
    assert stored.last_satisfied is True


@pytest.mark.asyncio
async def test_evaluate_rules_skips_disabled(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    repo = main_module.repo
    client = TestClient(app)
    monitor = client.post(
        "/api/monitors", json={"name": "A", "url": "https://example.com/a"}
    ).json()
    repo.update_monitor(monitor["id"], {"status": STATUS_IN_STOCK})

    repo.create_notification_rule(
        NotificationRule(
            id=None,
            name="Disabled rule",
            enabled=False,
            monitor_ids=[],
            trigger_statuses=["in_stock"],
            threshold=1,
            cooldown_minutes=0,
        )
    )
    ntfy = FakeNtfy()
    await evaluate_rules(
        repo,
        AppSettings(True, "https://ntfy.sh", "alerts", "", "default"),
        ntfy.send,
    )
    assert ntfy.messages == []


@pytest.mark.asyncio
async def test_evaluate_rules_supports_error_status(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    repo = main_module.repo
    client = TestClient(app)
    a = client.post("/api/monitors", json={"name": "A", "url": "https://example.com/a"}).json()
    b = client.post("/api/monitors", json={"name": "B", "url": "https://example.com/b"}).json()
    repo.update_monitor(a["id"], {"status": STATUS_ERROR})
    repo.update_monitor(b["id"], {"status": STATUS_ERROR})

    repo.create_notification_rule(
        NotificationRule(
            id=None,
            name="Watchdog",
            enabled=True,
            monitor_ids=[],
            trigger_statuses=["error", "challenge"],
            threshold=2,
            cooldown_minutes=0,
        )
    )
    ntfy = FakeNtfy()
    await evaluate_rules(
        repo,
        AppSettings(True, "https://ntfy.sh", "alerts", "", "default"),
        ntfy.send,
    )
    assert len(ntfy.messages) == 1
    title, message, _ = ntfy.messages[0]
    assert "Watchdog" in title
    assert "error or challenge" in message
