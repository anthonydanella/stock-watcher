<div align="center">

# Stock Watcher

**A beautiful, self-hosted stock monitor for product pages.**

Polls product URLs on a schedule, evaluates your match rules, detects
anti-bot challenges, and pings you the instant something comes back in
stock — all through a clean interface built for power users.

[Quick start](#quick-start) ·
[Features](#features) ·
[Configuration](#configuration) ·
[Architecture](#architecture)

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
  interface.
- **Self-hosted and private.** One Docker container, one SQLite file. Your
  watchlist never leaves your machine.

## Features

- **Scheduled polling** of any product URL with configurable intervals and
  jitter to avoid synchronized request bursts.
- **Flexible match rules** — CSS/text extractors with substring, regex, or
  quantity-threshold matching ([app/rules.py](app/rules.py)).
- **Quantity mode** — extract a numeric stock count from the page and alert
  on a threshold.
- **Challenge detection** — recognizes anti-bot interstitials, cools down
  the affected monitor, records the event, and can capture a screenshot
  ([app/challenges.py](app/challenges.py), [app/screenshots.py](app/screenshots.py)).
- **ntfy notifications** on stock changes, errors, and challenges, with
  per-monitor toggles so noisy products stay quiet.
- **Cross-monitor notification rules** — e.g. *"notify when 2+ monitors are
  in stock"* ([app/notification_rules.py](app/notification_rules.py)).
- **AI rule helper (optional)** — drafts a rule (extractor, target, match
  mode, quantity regex) from the live page using any OpenAI-compatible LLM
  endpoint.
- **SQLite persistence** for monitors, events, and attempt history — no
  external database required.

## Quick start

```bash
cp .env.example .env       # optional: set NTFY_TOPIC, LLM_API_KEY, etc.
docker compose up -d --build
```

Then open <http://localhost:8000>. State persists to the volume configured
in [docker-compose.yml](docker-compose.yml) (`/data` inside the container).

## Local development

**Backend** (Python 3.11+, [uv](https://docs.astral.sh/uv/)):

```bash
uv sync --dev
uv run uvicorn app.main:app --reload     # http://127.0.0.1:8000
```

**Frontend** (Node 24):

```bash
cd frontend
npm install
npm run dev                              # Vite dev server, proxies /api to FastAPI
```

When running the backend directly, a `.env` file at the repo root is loaded
automatically (real environment variables take precedence).

## Configuration

All configuration is environment-variable driven and parsed in
[app/config.py](app/config.py). Copy `.env.example` to `.env` and override
what you need.

| Variable | Default | Description |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Directory for SQLite and runtime state. |
| `DATABASE_PATH` | `<DATA_DIR>/stock_watcher.sqlite3` | SQLite file path. |
| `TZ` | `UTC` | Timezone for scheduling and timestamps. |
| `CHECK_LOOP_INTERVAL_SECONDS` | `15` (min `1`) | Scheduler tick interval. |
| `EVENT_RETENTION_LIMIT` | `1000` (min `100`) | Max stored events. |
| `ATTEMPT_RETENTION_LIMIT` | `5000` (min `100`) | Max stored check attempts. |
| `NTFY_SERVER` | `https://ntfy.sh` | ntfy server base URL. |
| `NTFY_TOPIC` | _(empty)_ | ntfy topic; notifications no-op until set. |
| `LLM_API_KEY` | _(empty)_ | Bearer token for the AI rule helper; disables it when unset. |
| `LLM_HTML_CHAR_LIMIT` | `200000` (min `4000`) | Max chars of page HTML sent to the LLM. |

Booleans accept `1/true/yes/on`.

## Architecture

```
app/                          FastAPI backend
  main.py                     HTTP routes and request/response shaping
  checker.py                  stock fetching and HTML/JSON parsing
  rules.py                    match-rule evaluation
  challenges.py               challenge-page detection
  scheduler.py                timed monitor execution loop
  notification_rules.py       cross-monitor alert evaluation
  ntfy.py                     ntfy notification dispatch
  llm.py                      AI rule suggestion helper
  repository.py / db.py /
    models.py                 SQLite persistence and schema
  config.py                   env-var-driven Settings
frontend/                     React + TypeScript UI (Tailwind, shadcn/ui)
tests/                        pytest backend tests
```

## Testing

```bash
uv run pytest                  # backend tests
uv run ruff check app tests    # backend lint
cd frontend && npm run build   # frontend type-check + build
cd frontend && npm run lint    # biome lint
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and conventions.

## License

[MIT](LICENSE)
