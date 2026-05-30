# Contributing

Thanks for helping improve Stock Watcher. This guide covers local setup, the
checks to run before opening a pull request, and the project's conventions.

## Prerequisites

- **Python 3.13+** with [uv](https://docs.astral.sh/uv/)
- **Node 24** with npm

## Development setup

**Backend:**

```bash
uv sync --dev                          # install runtime + test dependencies
uv run uvicorn app.main:app --reload   # serve on 127.0.0.1:8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev                            # Vite dev server; API calls proxy to FastAPI
```

A `.env` file at the repo root is loaded automatically when running the
backend (copy `.env.example` to `.env` to start). The full container can be
run with `docker compose up -d --build`.

## Before opening a pull request

Run the same checks CI runs (`.github/workflows/ci.yml`):

```bash
uv run ruff check app tests            # backend lint
uv run pytest                          # backend tests
npm run lint                           # biome lint (run from the repo root)
cd frontend && npm run build           # type-check + bundle
```

Biome is owned at the repo root (`biome.json` and the `lint`/`format` scripts
live in the root `package.json`); `frontend/` builds only.

- Add or update tests when changing checker behavior, match rules, API
  responses, scheduler timing, persistence, challenge detection, or
  notifications.
- Bump the version in `frontend/package.json` for user-visible frontend
  changes.

## Conventions

- **Python:** 3.13+, 4-space indentation, snake_case modules and tests. Add
  type hints across API, persistence, scheduler, and checker boundaries.
- **Frontend:** TypeScript, React function components, Tailwind, and shadcn/ui
  primitives. Components in PascalCase; hooks and helpers in camelCase; shared
  types in `frontend/src/types.ts`.
- **Commit messages:** clear and imperative, e.g. `Add scheduler cooldown
  test`.

## Pull requests

Fill out the PR template with a concise summary, test results, linked issues
when applicable, and screenshots for visible UI changes.
