import importlib
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


class FakeNtfy:
    def __init__(self, sent: bool = True) -> None:
        self.sent = sent
        self.messages: list[tuple[str, str, str]] = []

    async def send(self, settings, monitor, title, message, tags="package") -> bool:  # noqa: ANN001
        self.messages.append((title, message, tags))
        return self.sent


def load_app(monkeypatch, tmp_path):  # noqa: ANN001
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import app.config

    importlib.reload(app.config)
    import app.main

    return importlib.reload(app.main).app


def test_monitor_crud(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    created = client.post(
        "/api/monitors",
        json={
            "name": "GPU",
            "url": "https://example.com/gpu",
            "enabled": True,
            "check_mode": "browser",
            "interval_seconds": 900,
            "jitter_percent": 20,
            "rule_type": "text",
            "selector_or_path": "",
            "match_mode": "contains",
            "match_value": "in stock",
            "user_agent_mode": "random",
            "timeout_seconds": 20,
        },
    )
    assert created.status_code == 201
    monitor_id = created.json()["id"]
    next_check_at = datetime.fromisoformat(created.json()["next_check_at"])
    assert next_check_at <= datetime.now(timezone.utc) + timedelta(seconds=35)

    monitors = client.get("/api/monitors")
    assert monitors.status_code == 200
    assert monitors.json()[0]["name"] == "GPU"

    toggled = client.post(f"/api/monitors/{monitor_id}/toggle")
    assert toggled.status_code == 200
    assert toggled.json()["enabled"] is False

    deleted = client.delete(f"/api/monitors/{monitor_id}")
    assert deleted.status_code == 204


def test_settings_api(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    saved = client.put(
        "/api/settings",
        json={
            "ntfy_enabled": True,
            "ntfy_server": "https://ntfy.sh",
            "ntfy_topic": "stock-alerts",
            "ntfy_token": "",
            "ntfy_priority": "high",
        },
    )

    assert saved.status_code == 200
    assert saved.json()["ntfy_topic"] == "stock-alerts"
    assert client.get("/api/settings").json()["ntfy_priority"] == "high"


def test_scheduler_status_api(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    client = TestClient(app)

    created = client.post("/api/monitors", json={"name": "GPU", "url": "https://example.com/gpu"})
    monitor_id = created.json()["id"]
    main_module.repo.update_monitor(
        monitor_id,
        {"next_check_at": (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()},
    )

    response = client.get("/api/scheduler/status")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["running"], bool)
    assert body["loop_interval_seconds"] == main_module.settings.check_loop_interval_seconds
    assert body["due_monitor_count"] == 1
    assert body["next_due_at"] is not None
    assert body["monitor_counts"] == {
        "total": 1,
        "enabled": 1,
        "paused": 0,
        "cooling_down": 0,
    }
    assert body["last_run"] == {"started_at": None, "finished_at": None, "due_count": 0}
    assert body["last_loop_error"] is None
    assert body["last_loop_error_at"] is None
    assert isinstance(body["browser_checks"]["available"], bool)
    assert body["browser_checks"]["reason"]
    assert body["database_path"] == str(main_module.settings.database_path.resolve())
    assert body["retention"] == {"events": 1000, "attempts": 5000}


def test_settings_test_notification_sends_message(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    fake_ntfy = FakeNtfy()
    monkeypatch.setattr(main_module.checker, "ntfy", fake_ntfy)
    client = TestClient(app)
    client.put(
        "/api/settings",
        json={
            "ntfy_enabled": True,
            "ntfy_server": "https://ntfy.sh",
            "ntfy_topic": "stock-alerts",
            "ntfy_token": "",
            "ntfy_priority": "default",
        },
    )

    response = client.post("/api/settings/test-notification")

    assert response.status_code == 200
    assert response.json() == {"sent": True}
    assert fake_ntfy.messages == [
        ("Stock Checker test", "Stock Checker test notification sent successfully.", "bell")
    ]
    assert any(
        "ntfy test notification sent" in event["message"]
        for event in client.get("/api/events").json()
    )


def test_settings_test_notification_validates_configuration(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    disabled = client.post("/api/settings/test-notification")
    assert disabled.status_code == 400
    assert disabled.json()["detail"] == "ntfy notifications are disabled"

    client.put(
        "/api/settings",
        json={
            "ntfy_enabled": True,
            "ntfy_server": "https://ntfy.sh",
            "ntfy_topic": "",
            "ntfy_token": "",
            "ntfy_priority": "default",
        },
    )
    missing_topic = client.post("/api/settings/test-notification")
    assert missing_topic.status_code == 400
    assert missing_topic.json()["detail"] == "ntfy topic is required"


def test_settings_test_notification_reports_delivery_failure(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    monkeypatch.setattr(main_module.checker, "ntfy", FakeNtfy(sent=False))
    client = TestClient(app)
    client.put(
        "/api/settings",
        json={
            "ntfy_enabled": True,
            "ntfy_server": "https://ntfy.sh",
            "ntfy_topic": "stock-alerts",
            "ntfy_token": "",
            "ntfy_priority": "default",
        },
    )

    response = client.post("/api/settings/test-notification")

    assert response.status_code == 503
    assert response.json()["detail"] == "ntfy test notification failed"
    assert any(
        event["event_type"] == "notification_error" for event in client.get("/api/events").json()
    )


def test_invalid_monitor_enums_are_rejected(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/monitors",
        json={
            "name": "GPU",
            "url": "https://example.com/gpu",
            "enabled": True,
            "check_mode": "ftp",
            "interval_seconds": 900,
            "jitter_percent": 20,
            "rule_type": "text",
            "selector_or_path": "",
            "match_mode": "contains",
            "match_value": "in stock",
            "user_agent_mode": "random",
            "timeout_seconds": 20,
        },
    )

    assert response.status_code == 422


def test_monitor_defaults_use_browser_and_text_rule(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    response = client.post("/api/monitors", json={"name": "GPU", "url": "https://example.com/gpu"})

    assert response.status_code == 201
    created = response.json()
    assert created["check_mode"] == "browser"
    assert created["rule_type"] == "text"
    assert created["match_mode"] == "contains"
    assert created["last_screenshot_at"] is None
    assert created["last_screenshot_url"] is None
    assert created["notifications_enabled"] is True
    assert created["notify_on_stock_change"] is True
    assert created["notify_on_error"] is True
    assert created["notify_on_challenge"] is True


def test_monitor_notification_toggles_persist(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    created = client.post(
        "/api/monitors",
        json={
            "name": "GPU",
            "url": "https://example.com/gpu",
            "notifications_enabled": False,
            "notify_on_stock_change": False,
            "notify_on_error": True,
            "notify_on_challenge": False,
        },
    )

    assert created.status_code == 201
    monitor_id = created.json()["id"]
    fetched = client.get(f"/api/monitors/{monitor_id}").json()
    assert fetched["notifications_enabled"] is False
    assert fetched["notify_on_stock_change"] is False
    assert fetched["notify_on_error"] is True
    assert fetched["notify_on_challenge"] is False

    updated = client.put(
        f"/api/monitors/{monitor_id}",
        json={
            "name": "GPU",
            "url": "https://example.com/gpu",
            "notifications_enabled": True,
            "notify_on_stock_change": True,
            "notify_on_error": False,
            "notify_on_challenge": True,
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["notifications_enabled"] is True
    assert body["notify_on_stock_change"] is True
    assert body["notify_on_error"] is False
    assert body["notify_on_challenge"] is True


def test_monitor_serializes_cooldown_as_effective_next_check(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    client = TestClient(app)
    created = client.post("/api/monitors", json={"name": "GPU", "url": "https://example.com/gpu"})
    monitor_id = created.json()["id"]
    early_next_check = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    cooldown_until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    main_module.repo.update_monitor(
        monitor_id,
        {
            "next_check_at": early_next_check,
            "cooldown_until": cooldown_until,
        },
    )

    response = client.get(f"/api/monitors/{monitor_id}")

    assert response.status_code == 200
    assert response.json()["next_check_at"] == cooldown_until
    assert response.json()["cooldown_until"] == cooldown_until


def test_rule_lab_accepts_unsaved_monitor_payload(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    checker_module = importlib.import_module("app.checker")

    async def fake_fetch(monitor):  # noqa: ANN001
        assert monitor.selector_or_path == ".stock"
        return checker_module.FetchResult(
            200, "<p class='stock'>Sold out</p>", "text/html", {}, screenshot=b"jpeg"
        )

    monkeypatch.setattr(main_module.checker, "fetch", fake_fetch)
    client = TestClient(app)

    response = client.post(
        "/api/rule-lab",
        json={
            "name": "Draft monitor",
            "url": "https://example.com/gpu",
            "enabled": True,
            "check_mode": "browser",
            "interval_seconds": 900,
            "jitter_percent": 20,
            "rule_type": "text",
            "selector_or_path": ".stock",
            "match_mode": "contains",
            "match_value": "in stock",
            "user_agent_mode": "random",
            "timeout_seconds": 20,
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert body["matched"] is False
    assert body["fetch"]["screenshot"].startswith("data:image/jpeg;base64,")
    assert body["diagnostics"]["element_count"] == 1
    assert body["diagnostics"]["elements"][0]["text"] == "Sold out"


def test_monitor_screenshot_endpoint(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    screenshots = importlib.import_module("app.screenshots")
    client = TestClient(app)
    created = client.post("/api/monitors", json={"name": "GPU", "url": "https://example.com/gpu"})
    monitor_id = created.json()["id"]
    captured_at = datetime.now(timezone.utc).isoformat()
    screenshots.save_screenshot(main_module.settings, monitor_id, b"fake jpeg")
    main_module.repo.update_monitor(monitor_id, {"last_screenshot_at": captured_at})

    monitor = client.get(f"/api/monitors/{monitor_id}")
    image = client.get(f"/api/monitors/{monitor_id}/screenshot")

    assert monitor.status_code == 200
    assert monitor.json()["last_screenshot_at"] == captured_at
    assert monitor.json()["last_screenshot_url"] == f"/api/monitors/{monitor_id}/screenshot"
    assert image.status_code == 200
    assert image.content == b"fake jpeg"
    assert image.headers["content-type"].startswith("image/jpeg")


def test_monitor_history_endpoint_returns_attempts(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    client = TestClient(app)
    created = client.post("/api/monitors", json={"name": "GPU", "url": "https://example.com/gpu"})
    monitor_id = created.json()["id"]
    main_module.repo.add_attempt(monitor_id, "out_of_stock", False, 184, 200, "", "Sold out")
    main_module.repo.add_attempt(monitor_id, "error", False, 983, 503, "timeout", "Gateway timeout")
    main_module.repo.add_attempt(
        monitor_id,
        "in_stock",
        True,
        221,
        200,
        "",
        "Add to cart",
        reason="Extracted text contains the operand.",
    )

    response = client.get(f"/api/monitors/{monitor_id}/history?limit=2")

    assert response.status_code == 200
    attempts = response.json()
    assert [attempt["status"] for attempt in attempts] == ["in_stock", "error"]
    assert attempts[0]["ok"] is True
    assert attempts[0]["duration_ms"] == 221
    assert attempts[0]["http_status"] == 200
    assert attempts[0]["evidence"] == "Add to cart"
    assert attempts[0]["reason"] == "Extracted text contains the operand."
    assert attempts[0]["error_type"] == ""
    assert attempts[0]["created_at"]
    assert attempts[1]["error"] == "timeout"


def test_monitor_screenshot_requires_existing_file_and_is_deleted(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    main_module = importlib.import_module("app.main")
    screenshots = importlib.import_module("app.screenshots")
    client = TestClient(app)
    created = client.post("/api/monitors", json={"name": "GPU", "url": "https://example.com/gpu"})
    monitor_id = created.json()["id"]

    missing = client.get(f"/api/monitors/{monitor_id}/screenshot")
    assert missing.status_code == 404

    screenshots.save_screenshot(main_module.settings, monitor_id, b"fake jpeg")
    main_module.repo.update_monitor(
        monitor_id, {"last_screenshot_at": datetime.now(timezone.utc).isoformat()}
    )
    path = screenshots.screenshot_path(main_module.settings, monitor_id)
    assert path.exists()

    deleted = client.delete(f"/api/monitors/{monitor_id}")

    assert deleted.status_code == 204
    assert not path.exists()


def test_blank_monitor_name_is_rejected(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    app = load_app(monkeypatch, tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/monitors",
        json={
            "name": "   ",
            "url": "https://example.com/gpu",
            "enabled": True,
            "check_mode": "browser",
            "interval_seconds": 900,
            "jitter_percent": 20,
            "rule_type": "text",
            "selector_or_path": "",
            "match_mode": "contains",
            "match_value": "in stock",
            "user_agent_mode": "random",
            "timeout_seconds": 20,
        },
    )

    assert response.status_code == 422
