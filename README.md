<div align="center">

# Stock Watcher

**A beautiful, self-hosted stock monitor for product pages.**

Polls product URLs on a schedule, evaluates your match rules, detects
anti-bot challenges, and pushes you a notification the instant something
comes back in stock — all through a clean interface built for power users.

[Quick start](#quick-start) ·
[Features](#features) ·
[Notifications](#notifications) ·
[Configuration](#configuration)

</div>

---

## Screenshot

<div align="center">
  <img src="docs/screenshot.jpg" alt="Stock Watcher dashboard" width="900" />
</div>

---

## Why Stock Watcher

- **Designed for power users.** Dense, scan-friendly layouts.
- **Beautiful out of the box.** A polished React + Tailwind + shadcn/ui
  interface, installable as a PWA on desktop and mobile.
- **Self-hosted and private.** One Docker container, one SQLite file. Your
  watchlist never leaves your machine.

## Features

- **Scheduled polling** of any product URL with configurable intervals and
  jitter to avoid synchronized request bursts.
- **Flexible match rules** — CSS/text extractors with substring, regex, or
  quantity-threshold matching ([app/rules.py](app/rules.py)).
- **Quantity mode** — extract a numeric stock count from the page and alert
  on a threshold.
- **Challenge detection** — recognizes anti-bot interstitials, cools down the
  affected monitor, records the event, and can capture a screenshot
  ([app/challenges.py](app/challenges.py), [app/screenshots.py](app/screenshots.py)).
- **Notifications, your way** — Web Push, a generic webhook, or ntfy
  ([see below](#notifications)), with per-monitor toggles so noisy products
  stay quiet.
- **Cross-monitor rules** — e.g. *"notify when 2+ monitors are in stock"*
  ([app/notification_rules.py](app/notification_rules.py)).
- **Installable PWA** — add it to your phone's Home Screen for a full-screen
  app with an offline shell and Web Push; tuned for iOS standalone.
- **AI rule helper (optional)** — drafts a rule (extractor, target, match
  mode, quantity regex) from the live page using any OpenAI-compatible LLM
  endpoint.
- **SQLite persistence** for monitors, events, and attempt history — no
  external database required.

## Notifications

Configure any combination of channels in the **Settings** page:

- **Web Push** *(default)* — notifications to a browser or installed PWA, even
  when it's closed. No account or extra app. The VAPID keypair is generated
  and stored server-side automatically; each device opts in with one click. On
  iPhone/iPad, add the app to the Home Screen first (iOS 16.4+).
- **Webhook** — one JSON POST per alert, with presets for **Discord**,
  **Slack**, and generic JSON (**Home Assistant**, **Zapier**, n8n, …), plus
  optional custom headers.
- **ntfy** — push via an [ntfy](https://ntfy.sh) server and topic.

Per-monitor toggles control stock-change, error, and challenge alerts.

## Quick start

**Backend** (Python 3.13+, [uv](https://docs.astral.sh/uv/)):

```bash
uv sync --dev
uv run uvicorn app.main:app --reload
```

**Frontend** (Node 24):

```bash
cd frontend
npm install
npm run dev
```

Or run the whole thing in one container:

```bash
docker compose up -d --build
```

When running the backend directly, a `.env` file at the repo root is loaded
automatically (real environment variables take precedence).

## Configuration

All deployment configuration is environment-variable driven and parsed in
[app/config.py](app/config.py). Copy `.env.example` to `.env` and override
what you need. Notification channels themselves are configured in the
**Settings** page, not via env.

| Variable | Default | Description |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Directory for SQLite and runtime state (incl. the VAPID key). |
| `DATABASE_PATH` | `<DATA_DIR>/stock_watcher.sqlite3` | SQLite file path. |
| `TZ` | `UTC` | Timezone for scheduling and timestamps. |
| `CHECK_LOOP_INTERVAL_SECONDS` | `15` (min `1`) | Scheduler tick interval. |
| `EVENT_RETENTION_LIMIT` | `1000` (min `100`) | Max stored events. |
| `ATTEMPT_RETENTION_LIMIT` | `5000` (min `100`) | Max stored check attempts. |
| `WEBPUSH_CONTACT` | `mailto:admin@example.com` | VAPID `sub` contact for Web Push. |
| `NTFY_SERVER` | `https://ntfy.sh` | ntfy server base URL. |
| `NTFY_TOPIC` | _(empty)_ | ntfy topic; notifications no-op until set. |
| `LLM_API_KEY` | _(empty)_ | Bearer token for the AI rule helper; disables it when unset. |
| `LLM_HTML_CHAR_LIMIT` | `200000` (min `4000`) | Max chars of page HTML sent to the LLM. |

Booleans accept `1/true/yes/on`.

## Testing

```bash
uv run pytest                  # backend tests
uv run ruff check app tests    # backend lint
uv run pyright                 # backend type-check
cd frontend && npm run build   # frontend type-check + build
npm run lint                   # biome lint (run from the repo root)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and conventions.

## License

[MIT](LICENSE)
