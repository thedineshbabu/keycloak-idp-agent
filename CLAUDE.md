# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Talent Suite Platform Agent** — an agentic AI system for managing your Talent Suite Platform, including Keycloak IDP lifecycle, client and user management, policy intelligence, and certificate operations. It proxies requests to the Talent Suite platform (Core API + IAM API) and exposes them through a React UI.

## Commands

### Backend (FastAPI)
```bash
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env       # fill in values
python main.py             # http://localhost:8000
```

### Frontend (React + Vite)
```bash
npm install
npm run dev                # http://localhost:5173
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

## Architecture

```
React (App.jsx) → FastAPI (main.py) → IDPAgent / PolicyQueryEngine / platform_api.py
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
| `main.py` | FastAPI app — all route definitions and request models |
| `agent.py` | `IDPAgent` — LLM orchestration for onboard/update/chat workflows |
| `skill.py` | `IDP_SKILL_SCHEMA`, `VALIDATION_RULES`, `AGENT_SYSTEM_PROMPT` |
| `tools.py` | DB helpers, IAM push, cert scanning, usage logging, chat history |
| `auth.py` | Keycloak JWT validation via JWKS; `verify_token` / `require_admin` FastAPI deps |
| `keycloak_admin.py` | `KeycloakAdminClient` — service account auth + `build_context()` for policy queries |
| `platform_api.py` | Async httpx client for Core API and IAM API |
| `policy_engine.py` | `PolicyQueryEngine` — builds Keycloak context, calls LLM, returns structured answer |
| `datadog_api.py` | Async httpx client for Datadog logs, traces, metrics, monitors, and events (optional) |

### Frontend

`App.jsx` is a single-file React application containing all views and UI logic. `keycloak.js` configures the Keycloak JS adapter using `VITE_*` env vars.

## Critical implementation details

**`load_dotenv()` ordering**: `main.py` calls `load_dotenv()` as the very first statement, before any project module import. Other modules read env vars at module-level, so this order must be preserved.

**Database**: `tools.py` uses psycopg2 to connect to PostgreSQL exclusively. All tables live in the `idp_agent` schema, set via the connection `search_path` option. Migrations are managed by yuniql scripts under `yuniql/scripts/`.

**SSL verification disabled**: All HTTP calls to Keycloak, Core API, and IAM API use `verify=False`. This is intentional — these are internal services with self-signed certs.

**Token forwarding**: The user's Keycloak access token (extracted from `Authorization: Bearer`) is forwarded as-is to all downstream Core API and IAM API calls. Access token is in `user["access_token"]` from `verify_token`.

**Auth bypass**: When `KEYCLOAK_ENABLED=false` (default for Docker development), `verify_token` returns a synthetic admin context. Even in this mode, if the frontend sends a Bearer token it is still extracted and forwarded downstream.

**Role model**: Two roles — `agent-admin` (full write access, guarded by `require_admin` dependency) and read-only access for any authenticated user. Roles come from both `realm_access.roles` and `resource_access.<client_id>.roles` in the JWT.

**LLM calls**: Both `agent.py` and `policy_engine.py` call LLMs directly via httpx (no SDK). Every call is wrapped in a `try/finally` that logs usage to `llm_usage_logs` via `log_llm_usage()` in `tools.py`. LLM JSON responses are parsed with markdown fence stripping as a fallback. The LLM provider is controlled server-side via `DEFAULT_LLM_PROVIDER` env var (default `gemini`) — the frontend does not send or choose a provider.

**Usage guardrails**: Each user is limited to `DAILY_QUERY_LIMIT` (default 10) chat and policy queries per day. The limit is enforced in `/chat` and `/policy/query` endpoints via `_check_rate_limit()` which counts today's user messages in `chat_history`. Set to `0` to disable. Both config values are exposed via `GET /config`.

**APScheduler**: The daily certificate scan at 8am is optional — main.py wraps the import in try/except so the app starts normally if `apscheduler` is not installed.

## Extension points

- **Add IDP fields**: `skill.py` → `IDP_SKILL_SCHEMA`
- **Add validation rules**: `skill.py` → `VALIDATION_RULES`
- **Add simulation steps**: `tools.py` → `simulate_auth_flow()`
- **Add LLM cost rates for new models**: `tools.py` → `log_llm_usage()` cost table
- **Richer policy query context**: `keycloak_admin.py` → `build_context()`
- **New platform endpoints**: `platform_api.py` + wire in `main.py`
- **Add Datadog data sources**: `datadog_api.py` + register tools in `chat_engine.py` (`_DD_TOOLS` + `_execute_tool`)
