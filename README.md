# Talent Suite Platform Agent

An agentic AI system for managing your Talent Suite Platform — including Keycloak IDP lifecycle, client and user management, policy intelligence, and certificate operations.

## Architecture

```
React UI (frontend/)  →  FastAPI Backend (backend/)  →  Unified Chat Engine  →  51 Tools
                                    ↓                          ↓
                             OpenAI / Gemini LLM        RAG Context Engine
                                    ↓                   (PLATFORM_CONTEXT.md)
              PostgreSQL  |  Core API  |  IAM API  |  Datadog (optional)
                                    ↓
                       Keycloak Admin REST API
```

## Features

### Platform
- **Client Explorer** — Search and browse all Talent Suite clients; view client overview, licensed products, and a link to SSO configuration; on-load auto-fetches the full client list
- **User Management** — Look up any user by email; view name, status, locked/unlocked badge, assigned roles, and teams; execute admin actions: Reset Password, Magic Link, Lock, Unlock, Activate, Deactivate

### Manage
- **Get IDP by Domain** — Look up any IDP by email domain or full email address (domain is extracted automatically); results can be edited or cloned inline
- **Add My IDP** — Self-service onboard — any authenticated user can register an IDP for their own email domain; email domain is pre-filled from the logged-in user's token
- **Onboard New IDP** *(admin only)* — Full agent-assisted IDP onboard: validates inputs against schema, fetches existing patterns from DB, generates a complete config, simulates the auth flow, and pushes to IAM
- **Update IDP** *(admin only)* — Fetch current config by email domain, apply changes, validate, and push

### Observe
- **Token Usage** — Tracks token consumption and estimated cost per operation and model over time (last 30 days), with breakdowns by provider and ranked by cost
- **Certificates** — Scans all IDP certificates for expiry, alerts on certs expiring within 30 days; supports manual rotation from the UI; automated daily scan via APScheduler

### Intelligence
- **Policy Assistant** — Natural-language query engine that answers questions about Keycloak roles, policies, permissions, and users using live data from the Keycloak Admin API; context is built intelligently based on the question and answered by an LLM with cited sources and a confidence rating
- **Chat History** — Conversational interface with persistent chat sessions per user; session list in the left panel, chat bubbles in the right; continue any prior thread or start a new one

### Other
- **Keycloak SSO login** — JWT-based auth protecting write endpoints; access token is forwarded dynamically to all Core and IAM API calls; role-based UI (`agent-admin` vs viewer)
- **Clone IDP config** — Copy all SAML attributes from an existing IDP into a new onboard form; domain is intentionally left blank so you supply new domains
- **RAG Context Engine** — Embeds `PLATFORM_CONTEXT.md` on startup via Gemini text-embedding-004; injects the most relevant platform documentation sections into every chat prompt for domain-aware answers
- **Datadog Observability** *(optional)* — Query logs, traces, metrics, monitors, and events via the chat interface when Datadog keys are configured
- **Mock mode** — Works without a live DB or IAM service for prototyping

---

## Project Structure

```
kf-talentsuite-platform-agent/
├── backend/
│   ├── main.py                      # FastAPI app + all endpoints
│   ├── agent.py                     # IDPAgent — LLM orchestration for onboard/update workflows
│   ├── chat_engine.py               # UnifiedChatEngine — multi-service chat with 51 function-calling tools
│   ├── embedding_context_engine.py  # RAG context engine (Gemini embeddings + cosine similarity)
│   ├── skill.py                     # IDP skill schema + system prompt
│   ├── tools.py                     # DB helpers, Core API, simulator, usage logging, certificates, chat history
│   ├── auth.py                      # Keycloak JWT validation middleware
│   ├── keycloak_admin.py            # Keycloak Admin API client (service account auth)
│   ├── platform_api.py              # Talent Suite Core & IAM API async HTTP client
│   ├── policy_engine.py             # LLM-powered policy query engine
│   ├── datadog_api.py               # Datadog logs, traces, metrics, monitors, events (optional)
│   ├── requirements.txt             # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── App.jsx                      # React UI (all views)
│   ├── keycloak.js                  # Keycloak JS adapter config
│   ├── main.jsx                     # React entry point
│   ├── vite.config.js
│   └── Dockerfile
├── yuniql/scripts/                  # PostgreSQL migrations (yuniql)
│   └── v0.00/                       # Initial schema (idp_agent.*)
├── PLATFORM_CONTEXT.md              # Platform documentation for RAG context engine
├── docker-compose.yml
└── .env.example
```

---

## Quick Start (Docker)

```bash
cp .env.example .env
# Fill in all required values (see Configuration section)

docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

PostgreSQL is auto-initialised from the yuniql migration scripts (`yuniql/scripts/v0.00/*.sql`) on first boot. No manual DB setup needed.

---

## Local Setup (without Docker)

### Backend

```bash
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r backend/requirements.txt

cp .env.example .env
# Fill in your values

cd backend && python main.py
# Runs on http://localhost:8000
```

### Database

Apply the yuniql migration scripts once if running Postgres locally:

```bash
psql -U iam_user -d iam_db -c "CREATE SCHEMA IF NOT EXISTS idp_agent;"
psql -U iam_user -d iam_db -c "ALTER ROLE iam_user SET search_path TO idp_agent, public;"
for f in yuniql/scripts/v0.00/*.sql; do psql -U iam_user -d iam_db -f "$f"; done
```

Creates (in the `idp_agent` schema):
- `llm_usage_logs` — per-call token usage and cost tracking
- `chat_history` — persistent chat sessions per user

IDP configurations and certificate data are managed via the Core API custom attributes endpoint.

### Frontend

```bash
cd frontend && npm install
cd frontend && npm run dev
# Runs on http://localhost:5173
```

---

## Configuration

### `.env` reference

```bash
# LLM providers
OPENAI_API_KEY=
GEMINI_API_KEY=

# Agent guardrails
DEFAULT_LLM_PROVIDER=gemini          # openai | gemini
DAILY_QUERY_LIMIT=10                 # max chat/policy queries per user per day (0 = unlimited)

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iam_db
DB_USER=iam_user
DB_PASSWORD=

# IDP write service
IAM_SERVICE_BASE_URL=http://localhost:8080/api/v1

# Talent Suite Core API (clients, products, SSO attributes)
CORE_API_BASE_URL=https://your-core-api-host

# Talent Suite IAM API (users, roles, shadow users, communities)
IAM_API_BASE_URL=https://your-iam-api-host

# JWT bearer token used as fallback for scheduled jobs only
CORE_API_BEARER_TOKEN=

# Keycloak SSO (backend JWT validation)
KEYCLOAK_ENABLED=true
KEYCLOAK_URL=https://your-keycloak-server
KEYCLOAK_REALM=your-realm
KEYCLOAK_CLIENT_ID=your-client-id

# Keycloak Admin Service Account (Policy Query Engine)
KEYCLOAK_ADMIN_CLIENT_ID=your-service-account-client-id
KEYCLOAK_ADMIN_CLIENT_SECRET=your-client-secret

# RAG Context Engine (optional — omit to disable)
PLATFORM_DOCS_PATH=                  # default: PLATFORM_CONTEXT.md in repo root

# Datadog (optional — omit to disable observability tools in chat)
DATADOG_API_KEY=
DATADOG_APP_KEY=
DATADOG_SITE=datadoghq.com

# Frontend (Vite)
VITE_API_URL=http://localhost:8000
VITE_KEYCLOAK_ENABLED=false
VITE_KEYCLOAK_URL=https://your-keycloak-server
VITE_KEYCLOAK_REALM=your-realm
VITE_KEYCLOAK_CLIENT=your-client-id
```

### Talent Suite Core API

`CORE_API_BASE_URL` points to your Talent Suite Core service. The following endpoints are used:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v2/clients` | List / search clients |
| `GET` | `/v2/clients/by-id/{id}` | Single client detail |
| `GET` | `/v2/products` | Products by client key |
| `GET` | `/v2/products/getActiveProducts` | All active products |
| `GET` | `/v2/clients/login-mode` | Login mode for an email |
| `GET` | `/v2/clients/customAttributes` | Fetch SSO attributes |
| `POST` | `/v2/clients/customAttributes` | Create SSO attributes |
| `PUT` | `/v2/clients/customAttributes` | Upsert SSO attributes |

> SSL verification is disabled (`verify=False`) for all Core API calls (internal CA / self-signed cert).

### Talent Suite IAM API

`IAM_API_BASE_URL` points to your Talent Suite IAM service. The following endpoints are used:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v2/users/search` | Search users by email or PAMS ID |
| `GET` | `/v2/users/{id}/details` | Full user record |
| `GET` | `/v2/users/by-clientid/{id}` | Users for a client |
| `PATCH` | `/v2/users/lock` | Lock / unlock accounts |
| `PATCH` | `/v2/users/status` | Activate / deactivate accounts |
| `POST` | `/v2/users/reset-password` | Send password reset email |
| `POST` | `/v1/event/send-magic-link` | Send magic-link login |
| `POST` | `/v1/event/send-otp` | Send OTP |
| `GET` | `/v2/roles` | List all IAM roles |
| `GET` | `/v3/shadow-users` | List shadow users |
| `GET` | `/v3/shadow-users/{key}/clients` | Shadow user client access |
| `GET` | `/v3/communities` | List communities |
| `GET` | `/v2/userGroups/by-clientid/{id}` | User groups for a client |

### Keycloak SSO

```bash
KEYCLOAK_ENABLED=true
KEYCLOAK_URL=https://your-keycloak-server
KEYCLOAK_REALM=your-realm
KEYCLOAK_CLIENT_ID=your-client-id
```

When `KEYCLOAK_ENABLED=false` (default), every request gets a synthetic `agent-admin` context so local development works without a Keycloak instance.

JWT validation uses the Keycloak JWKS endpoint. Audience (`aud`) enforcement is intentionally disabled to handle tokens where `aud=["account"]` — the issuer check is the primary security boundary.

#### Keycloak client setup (one-time)

1. Create a client — protocol `openid-connect`, access type `public`
   - Valid Redirect URIs: `http://localhost:5173/*`
   - Web Origins: `http://localhost:5173`
2. Create client roles: `agent-admin` (full access) and `agent-viewer` (read-only)
3. Assign roles to users

### Policy Query Engine — Service Account Setup

1. Create a Keycloak client with **Service Accounts** enabled
2. Assign roles from `realm-management`: `view-realm`, `view-clients`, `view-users`, `query-users`, `query-clients`
3. Copy client ID and secret to `.env`:

```bash
KEYCLOAK_ADMIN_CLIENT_ID=your-service-account-client-id
KEYCLOAK_ADMIN_CLIENT_SECRET=your-client-secret
```

The engine authenticates via `client_credentials` grant and caches the token, refreshing it 30 seconds before expiry.

---

## API Reference

### Core IDP

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check |
| `GET` | `/config` | — | Client-visible config (LLM provider, daily query limit) |
| `GET` | `/idps` | any | List all IDP configs |
| `GET` | `/idps/{email_domain}` | any | Fetch a single IDP by email domain |
| `POST` | `/onboard` | admin | Onboard a new IDP |
| `POST` | `/onboard-user` | any | Self-service onboard |
| `POST` | `/update` | admin | Update an existing IDP |
| `POST` | `/chat` | any | Conversational interface (persists history, RAG-augmented) |
| `GET` | `/chat/sessions` | any | List current user's chat sessions |
| `GET` | `/chat/sessions/{id}` | any | Messages in a session |
| `GET` | `/skill/schema` | — | IDP field schema |

### Platform — Clients (Core API proxy)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/platform/clients` | any | List / search clients (`?search=`, `?page=`, `?limit=`) |
| `GET` | `/platform/clients/{id}` | any | Single client record |
| `GET` | `/platform/clients/{id}/products` | any | Products for a client |
| `GET` | `/platform/clients/{id}/users` | any | Users for a client (paginated) |
| `GET` | `/platform/clients/{id}/groups` | any | User groups for a client |
| `GET` | `/platform/login-mode?email=` | any | Login mode for an email address |
| `GET` | `/platform/products` | any | All active products |

### Platform — Users (IAM API proxy)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/platform/users/search?email=` | any | Search users by email or PAMS ID |
| `GET` | `/platform/users/{id}/details` | any | Full user record |
| `PATCH` | `/platform/users/lock` | admin | Lock / unlock accounts |
| `PATCH` | `/platform/users/status` | admin | Activate / deactivate accounts |
| `POST` | `/platform/users/reset-password` | admin | Send password reset email |
| `POST` | `/platform/users/magic-link` | admin | Send magic-link login |

### Platform — Roles / Shadow Users / Communities

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/platform/roles` | any | All IAM roles |
| `GET` | `/platform/shadow-users` | any | All shadow users |
| `GET` | `/platform/shadow-users/{key}/clients` | any | Shadow user client access |
| `GET` | `/platform/communities` | any | All communities |

### Usage

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/usage/summary` | any | Total tokens + cost by operation (last 30 days) |
| `GET` | `/usage/by-provider` | any | Breakdown by OpenAI vs Gemini |
| `GET` | `/usage/timeline` | any | Daily token usage over last 30 days |
| `GET` | `/usage/operations` | any | Most expensive operations ranked |
| `GET` | `/usage/recent` | any | 50 most recent LLM call records |

### Certificates

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/certificates/scan` | any | Scan all IDPs, return cert status |
| `GET` | `/certificates/expiring` | any | IDPs with certs expiring < 30 days |
| `POST` | `/certificates/rotate` | admin | Push a new certificate to IAM |
| `POST` | `/certificates/schedule-scan` | admin | Check daily scan scheduler status |

### Policy Query Engine

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/policy/realms` | any | List all Keycloak realms |
| `POST` | `/policy/query` | any | Natural-language question about roles, policies, or users |
| `GET` | `/policy/roles/{realm}` | any | All realm-level roles |
| `GET` | `/policy/clients/{realm}` | any | All clients in the realm |
| `GET` | `/policy/user/{realm}/{username}` | any | Roles and groups for a user |

#### `POST /policy/query` — request / response

```json
// Request
{ "question": "What can a client-admin access?", "realm": "your-realm", "llm_provider": "openai" }

// Response
{
  "status": "success",
  "answer": {
    "answer": "Direct one-to-three sentence answer.",
    "details": "Elaboration with specifics from the context.",
    "sources": ["realm role: client-admin", "client: my-app"],
    "confidence": "high"
  },
  "token_usage": { "prompt_tokens": 800, "completion_tokens": 300, "total_tokens": 1100 }
}
```

### Admin (Keycloak Configuration)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/userid-mapper` | admin | Check if userId claim mapper exists on a Keycloak client |
| `POST` | `/admin/userid-mapper` | admin | Idempotently add userId user-attribute protocol mapper |

### Core API Proxy (SSO Attributes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/core/customAttributes?domainUrl=` | any | Fetch SSO attributes for a domain |
| `POST` | `/core/customAttributes?domainUrl=` | admin | Create SSO attributes (409 if exists) |
| `PUT` | `/core/customAttributes?domainUrl=` | admin | Upsert SSO attributes |

---

## UI Sidebar Reference

| Section | Item | Role | Description |
|---------|------|------|-------------|
| Platform | Client Explorer | any | Browse and search all Talent Suite clients |
| Platform | User Management | any / admin | Search users, view details; admin actions require `agent-admin` role |
| Manage | Get IDP by Domain | any | Look up one IDP; email input supported (domain auto-extracted); inline edit and clone |
| Manage | Add My IDP | any | Self-service onboard — pre-fills domain from logged-in user's email |
| Manage | Onboard New IDP | admin | Full agent-assisted onboard flow |
| Manage | Update IDP | admin | Fetch and edit an existing IDP |
| Observe | Token Usage | any | Token consumption and cost dashboard |
| Observe | Certificates | any | Certificate expiry status and rotation |
| Intelligence | Policy Assistant | any | Natural-language query engine for Keycloak roles, policies, and users |
| Intelligence | Chat History | any | Persistent chat sessions — session list + chat bubbles |

### Get IDP by Domain — inline actions

After a successful domain lookup:
- **Edit** — inline form pre-filled with the current SAML attributes; changes are submitted to `POST /update`
- **Clone** — copies all SAML attributes into a new onboard form; email domain is left blank for you to fill

### Policy Assistant — answer card anatomy

Each answer shows: question, direct answer block, details, source tags (each Keycloak entity cited), confidence badge (`high`/`medium`/`low`), missing data note, and token footer.

---

## Extending

- Add new required IDP fields in `backend/skill.py` → `IDP_SKILL_SCHEMA`
- Add new validation rules in `backend/skill.py` → `VALIDATION_RULES`
- Add more simulation steps in `backend/tools.py` → `simulate_auth_flow()`
- Add new Platform API endpoints in `backend/platform_api.py` and wire them in `backend/main.py`
- Add cost rates for new LLM models in `backend/tools.py` → `log_llm_usage()`
- Add new Keycloak context sources in `backend/keycloak_admin.py` → `build_context()` for richer policy queries
- Add new chat tools in `backend/chat_engine.py` → `_TOOLS` list + `_execute_tool()` dispatcher
- Add new Datadog data sources in `backend/datadog_api.py` + register in `backend/chat_engine.py` (`_DD_TOOLS` + `_execute_tool`)
- Update platform documentation in `PLATFORM_CONTEXT.md` for the RAG context engine (restart required to re-embed)
