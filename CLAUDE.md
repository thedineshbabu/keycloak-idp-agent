# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Talent Suite Platform Agent** — an agentic AI system for managing the Talent Suite Platform, including Keycloak IDP lifecycle, client and user management, policy intelligence, and certificate operations. It proxies requests to the Talent Suite platform (Core API + IAM API) and exposes them through a React UI.

## Commands

### Backend (FastAPI)
```bash
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r backend/requirements.txt
cp .env.example .env       # fill in values
cd backend && python main.py   # http://localhost:8000
```

### Frontend (React + Vite)
```bash
cd frontend && npm install
cd frontend && npm run dev     # http://localhost:5173
```

### Docker (all services)
```bash
cp .env.example .env       # fill in values
docker compose up --build
```

### Database (local Postgres, if not using Docker)
```bash
psql -U iam_user -d iam_db -c "CREATE SCHEMA IF NOT EXISTS idp_agent;"
psql -U iam_user -d iam_db -c "ALTER ROLE iam_user SET search_path TO idp_agent, public;"
for f in yuniql/scripts/v0.00/*.sql; do psql -U iam_user -d iam_db -f "$f"; done
```

### Lint
```bash
pip install ruff
ruff check backend/
```
`backend/ruff.toml` suppresses E402 in `main.py` because `load_dotenv()` must run before all other imports.

### Test
```bash
pip install pytest pytest-cov pytest-asyncio httpx
cd backend && pytest -v
```
Tests require a running PostgreSQL with the `idp_agent` schema initialised (see Database above). Set `KEYCLOAK_ENABLED=false` in the environment.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`, `develop`, `rc/v**`:
- **Lint** — `ruff check backend/` (Python 3.12)
- **Test** — `pytest` against a Postgres 16 service container
- **Frontend Lint & Build** — `npm ci && npm run build` (Node 20)

## Architecture

```
React (frontend/App.jsx) → FastAPI (backend/main.py) → UnifiedChatEngine / IDPAgent / PolicyQueryEngine
                                              ↓
                                  OpenAI gpt-4o / Gemini gemini-2.0-flash
                                              ↓
                  PostgreSQL  |  Core API (clients/products)  |  IAM API (users/roles)
                                              ↓
                                   Keycloak Admin REST API
                                              ↓
                                   Datadog (logs / traces / metrics / monitors)
```

### Key backend modules

| File | Role |
|------|------|
| `backend/main.py` | FastAPI app — all route definitions and request models |
| `backend/agent.py` | `IDPAgent` — LLM orchestration for onboard/update workflows |
| `backend/chat_engine.py` | `UnifiedChatEngine` — multi-service chat with ~51 LLM function-calling tools across Keycloak, IAM, Core API, certificates, and Datadog |
| `backend/embedding_context_engine.py` | `EmbeddingContextEngine` — RAG engine using Gemini text-embedding-004 + cosine similarity over `PLATFORM_CONTEXT.md` |
| `backend/skill.py` | `IDP_SKILL_SCHEMA`, `VALIDATION_RULES`, `AGENT_SYSTEM_PROMPT` |
| `backend/tools.py` | DB helpers, Core API attribute CRUD, cert scanning, usage logging, chat history |
| `backend/auth.py` | Keycloak JWT validation via JWKS; `verify_token` / `require_admin` FastAPI deps |
| `backend/keycloak_admin.py` | `KeycloakAdminClient` — service account auth + `build_context()` for policy queries |
| `backend/platform_api.py` | Async httpx client for Core API and IAM API |
| `backend/policy_engine.py` | `PolicyQueryEngine` — builds Keycloak context, calls LLM, returns structured answer |
| `backend/datadog_api.py` | Async httpx client for Datadog logs, traces, metrics, monitors, and events (optional) |

### Frontend

`frontend/App.jsx` is a single-file React application containing all views and UI logic. `frontend/keycloak.js` configures the Keycloak JS adapter using `VITE_*` env vars. The frontend has no linter configured — CI only validates `npm run build` succeeds.

## Critical implementation details

**`load_dotenv()` ordering**: `backend/main.py` calls `load_dotenv(find_dotenv(usecwd=True))` as the very first statement, before any project module import. `find_dotenv()` walks up from `backend/` to find `.env` at the repo root. Other modules read env vars at module-level, so this order must be preserved. The ruff E402 suppression in `backend/ruff.toml` exists specifically for this pattern.

**Database**: `backend/tools.py` uses psycopg2 to connect to PostgreSQL exclusively. All tables live in the `idp_agent` schema, set via the connection `search_path` option. Migrations are managed by yuniql scripts under `yuniql/scripts/`. In Docker, the migration SQL files are mounted directly into Postgres's `docker-entrypoint-initdb.d` for automatic setup on first boot.

**SSL verification disabled**: All HTTP calls to Keycloak, Core API, and IAM API use `verify=False`. This is intentional — these are internal services with self-signed certs.

**Token forwarding**: The user's Keycloak access token (extracted from `Authorization: Bearer`) is forwarded as-is to all downstream Core API and IAM API calls. Access token is in `user["access_token"]` from `verify_token`.

**Auth bypass**: When `KEYCLOAK_ENABLED=false` (default for Docker development), `verify_token` returns a synthetic admin context. Even in this mode, if the frontend sends a Bearer token it is still extracted and forwarded downstream.

**Role model**: Two roles — `agent-admin` (full write access, guarded by `require_admin` dependency) and read-only access for any authenticated user. Roles come from both `realm_access.roles` and `resource_access.<client_id>.roles` in the JWT. Audience (`aud`) enforcement is intentionally disabled — the issuer check is the primary security boundary.

**LLM calls**: Both `backend/agent.py` and `backend/policy_engine.py` call LLMs directly via httpx (no SDK). Every call is wrapped in a `try/finally` that logs usage to `llm_usage_logs` via `log_llm_usage()` in `backend/tools.py`. LLM JSON responses are parsed with markdown fence stripping as a fallback. The LLM provider is controlled server-side via `DEFAULT_LLM_PROVIDER` env var (default `gemini`) — the frontend does not send or choose a provider.

**Dual LLM support**: Both OpenAI and Gemini are supported. Each LLM caller (`agent.py`, `chat_engine.py`, `policy_engine.py`) has separate `_call_openai()` and `_call_gemini()` methods because the two APIs have different request/response formats. The provider is selected at request time from `DEFAULT_LLM_PROVIDER`.

**Chat engine function-calling**: `UnifiedChatEngine` in `chat_engine.py` defines tools in `_TOOLS` list (OpenAI JSON schema format) and dispatches calls via `_execute_tool()`. Tools span Keycloak, IAM, Core API, IDP certificates, usage logs, and Datadog. Datadog tools (`_DD_TOOLS`) are conditionally appended only when `DATADOG_API_KEY`/`DATADOG_APP_KEY` are set (checked via `dd_available()`).

**RAG context engine**: `EmbeddingContextEngine` splits `PLATFORM_CONTEXT.md` into sections at `## ` headings, embeds each via Gemini text-embedding-004 on startup, and injects the top-k most relevant sections (cosine similarity) into every chat prompt. Requires `GEMINI_API_KEY`. Gracefully degrades if the key or file is missing. Changing `PLATFORM_CONTEXT.md` requires a backend restart to re-embed.

**Usage guardrails**: Each user is limited to `DAILY_QUERY_LIMIT` (default 10) chat and policy queries per day. The limit is enforced in `/chat` and `/policy/query` endpoints via `_check_rate_limit()` which counts today's user messages in `chat_history`. Set to `0` to disable. Both config values are exposed via `GET /config`.

**APScheduler**: The daily certificate scan at 8am is optional — `backend/main.py` wraps the import in try/except so the app starts normally if `apscheduler` is not installed.

**Downstream error handling**: `backend/main.py` uses `_downstream_detail()` to extract human-readable messages from Core API and IAM API error responses, handling both NestJS `{"message":...}` and IAM `{"error_details":...}` formats.

## Extension points

- **Add IDP fields**: `backend/skill.py` → `IDP_SKILL_SCHEMA`
- **Add validation rules**: `backend/skill.py` → `VALIDATION_RULES`
- **Add simulation steps**: `backend/tools.py` → `simulate_auth_flow()`
- **Add LLM cost rates for new models**: `backend/tools.py` → `log_llm_usage()` cost table
- **Richer policy query context**: `backend/keycloak_admin.py` → `build_context()`
- **New platform endpoints**: `backend/platform_api.py` + wire in `backend/main.py`
- **Add chat tools**: `backend/chat_engine.py` → `_TOOLS` list + `_execute_tool()` dispatcher
- **Add Datadog data sources**: `backend/datadog_api.py` + register in `backend/chat_engine.py` (`_DD_TOOLS` + `_execute_tool`)
- **Update RAG knowledge**: edit `PLATFORM_CONTEXT.md` (restart required to re-embed)
