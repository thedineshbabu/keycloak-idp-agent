# Keycloak IDP Onboarding Agent

An agentic AI system for onboarding and managing client IDPs in your custom Keycloak setup.

## Architecture

```
React UI  →  FastAPI Backend  →  Agent Core  →  Tools
                                     ↓
                              OpenAI / Gemini LLM
                                     ↓
                PostgreSQL  |  Core API (customAttributes)  |  Auth Simulator

                       ↕ (Policy Query Engine)
                 Keycloak Admin REST API
```

## Features

- **Onboard new IDPs** — Agent validates inputs against the IDP skill schema, fetches existing patterns from your DB, generates a complete config, simulates the auth flow, and pushes to your IAM service
- **Self-service onboard** — Any authenticated user can register an IDP for their own email domain via `/onboard-user`; their email domain is pre-filled in the UI
- **Update existing IDPs** — Fetch current config by email domain, apply changes (certificate rotation, URL updates, etc.), validate, and push
- **Get IDP by Domain** — Look up any IDP by email domain or full email address (domain is extracted automatically); results can be edited or cloned inline
- **Clone IDP config** — Copy all SAML attributes from an existing IDP into a new onboard form; domain is intentionally left blank so you supply new domains
- **Smart validation** — Asks for missing required fields before proceeding
- **Auth flow simulation** — Validates routing, attribute mapping, certificate format, SSO URL reachability, and JWT enrichment
- **LLM-powered review** — Uses OpenAI or Gemini to review configs against your existing patterns
- **Token usage dashboard** — Tracks token consumption and estimated cost per operation and model over time
- **Keycloak SSO login** — JWT-based auth protecting write endpoints; access token is forwarded dynamically to all Core API calls; role-based UI (admin vs viewer)
- **Certificate rotation** — Scans all IDP certificates for expiry, alerts on certs expiring within 30 days, supports manual rotation from the UI; automated daily scan via APScheduler
- **Policy Assistant** — Natural-language query engine that answers questions about Keycloak roles, policies, permissions, and users using live data from the Keycloak Admin API; context is built intelligently based on the question and answered by an LLM with cited sources and a confidence rating
- **Core API proxy** — Direct GET/POST/PUT proxy to the internal Core API (`/v2/clients/customAttributes`) for fine-grained attribute management
- **Mock mode** — Works without a live DB or IAM service for prototyping

## Project Structure

```
keycloak-idp-agent/
├── main.py              # FastAPI app + all endpoints
├── agent.py             # Agent core (LLM orchestration + usage logging)
├── skill.py             # IDP skill schema + system prompt
├── tools.py             # Tool functions (DB, Core API, simulator, usage, certificates)
├── auth.py              # Keycloak JWT validation middleware
├── keycloak_admin.py    # Keycloak Admin API client (service account auth)
├── policy_engine.py     # LLM-powered policy query engine
├── keycloak.js          # Frontend Keycloak client config
├── App.jsx              # React UI (all views)
└── schema.sql           # PostgreSQL table DDL
```

## Quick Start (Docker)

The fastest way to run everything:

```bash
cp .env.example .env
# Fill in OPENAI_API_KEY and DB_PASSWORD at minimum

docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

PostgreSQL is auto-initialised from `schema.sql` on first boot. No manual DB setup needed.

---

## Local Setup (without Docker)

### Backend

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Fill in your values, then:
source .env

python main.py
# Runs on http://localhost:8000
```

### Database

If running Postgres locally, apply the schema once:

```bash
psql -U iam_user -d iam_db -f schema.sql
```

This creates:
- `llm_usage_logs` — per-call token usage and cost tracking
- `cert_alerts` — certificate expiry alert records

### Frontend

```bash
npm install
npm run dev
# Runs on http://localhost:5173
```

## Configuration

### Database & IAM service (`tools.py`)

```python
DB_CONFIG = {
    "host": "your-postgres-host",
    "database": "your_iam_db",
    "user": "your_user",
    "password": "your_password"
}

IAM_SERVICE_BASE_URL = "http://your-iam-service/api/v1"
```

The IAM service should expose:
- `GET /api/v1/idp/configurations` — list all IDPs
- `POST /api/v1/idp/configurations` — create new IDP
- `PUT /api/v1/idp/configurations/{email_domain}` — update IDP

### Core API (`tools.py`)

The agent integrates with an internal Core API for SSO attribute management:

```bash
export CORE_API_BASE_URL=https://your-core-api-host
export CORE_API_BEARER_TOKEN=<service-account-token>   # fallback for scheduled jobs
```

`CORE_API_BEARER_TOKEN` is only used as a fallback (e.g., the automated daily certificate scan). For all user-initiated requests, the logged-in user's Keycloak access token is forwarded dynamically instead.

The Core API is expected to expose:
- `GET /v2/clients/customAttributes?domainUrl=<domain>` — fetch SSO attributes
- `POST /v2/clients/customAttributes?domainUrl=<domain>` — create SSO attributes (409 if already exists)
- `PUT /v2/clients/customAttributes?domainUrl=<domain>` — upsert SSO attributes

> **Note:** If the Core API uses an internal CA or self-signed certificate, SSL verification is disabled (`verify=False`) for all Core API calls.

### Keycloak SSO

Set environment variables to enable token enforcement:

```bash
export KEYCLOAK_ENABLED=true
export KEYCLOAK_URL=https://your-keycloak-server
export KEYCLOAK_REALM=your-realm
export KEYCLOAK_CLIENT_ID=your-client-id
```

When `KEYCLOAK_ENABLED` is `false` (the default), every request gets a synthetic `agent-admin` context so local development works without a Keycloak instance.

JWT validation uses the Keycloak JWKS endpoint (`/realms/{realm}/protocol/openid-connect/certs`) and enforces the `iss` claim. Audience (`aud`) enforcement is intentionally disabled to handle tokens where `aud=["account"]` rather than the client ID — the issuer check is the primary security boundary.

#### Keycloak client setup (one-time)

1. Create a client in your realm
   - Protocol: `openid-connect`, Access Type: `public`
   - Valid Redirect URIs: `http://localhost:5173/*`
   - Web Origins: `http://localhost:5173`
2. Create client roles: `agent-admin` (full access) and `agent-viewer` (read-only)
3. Assign roles to users

#### Frontend Keycloak setup

```bash
npm install keycloak-js
```

Add to your `.env`:

```
VITE_KEYCLOAK_ENABLED=true
VITE_KEYCLOAK_URL=https://your-keycloak-server
VITE_KEYCLOAK_REALM=your-realm
VITE_KEYCLOAK_CLIENT=your-client-id
```

When enabled, the UI shows the logged-in user's name, a logout button, and hides admin-only actions (Onboard, Update IDP) from viewer-role users. The access token obtained at login is attached as a `Bearer` header on every API call and forwarded to the Core API automatically.

### Policy Query Engine — Service Account Setup

The Policy Assistant requires a dedicated Keycloak service account with read access to the Admin REST API.

#### 1. Create the service account client (one-time, in Keycloak Admin Console)

1. Go to your realm → **Clients** → **Create**
2. Set **Access Type** to `confidential` and enable **Service Accounts**
3. Under **Service Account Roles**, assign the following roles from the `realm-management` client:
   - `view-realm`
   - `view-clients`
   - `view-users`
   - `query-users`
   - `query-clients`
4. Copy the client ID and secret from the **Credentials** tab

#### 2. Add to `.env`

```bash
KEYCLOAK_ADMIN_CLIENT_ID=your-service-account-client-id
KEYCLOAK_ADMIN_CLIENT_SECRET=your-client-secret
```

The engine authenticates via the `client_credentials` grant and caches the token in memory, refreshing it automatically 30 seconds before expiry.

#### Example questions the engine can answer

| Question | Context fetched |
|----------|----------------|
| What can a client-admin access? | realm roles, clients, authz data |
| What roles does user john@acme.com have? | users (search), user roles, user groups |
| What redirect URIs are on the talent app? | clients |
| What's the difference between admin and viewer? | realm roles, role composites |
| Which clients have authorization services enabled? | clients |
| What policies block access to the reports resource? | authz data for enabled clients |
| Which users are in the super-admin role? | realm roles, role membership |

## API Reference

### Core

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check |
| `GET` | `/idps` | any | List all IDP configs |
| `GET` | `/idps/{email_domain}` | any | Fetch a single IDP by email domain |
| `POST` | `/onboard` | admin | Onboard a new IDP (agent-admin role required) |
| `POST` | `/onboard-user` | any | Self-service onboard — any authenticated user |
| `POST` | `/update` | admin | Update an existing IDP |
| `POST` | `/chat` | any | Conversational interface |
| `GET` | `/skill/schema` | — | IDP field schema |

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
| `GET` | `/policy/realms` | any | List all Keycloak realms visible to the service account |
| `POST` | `/policy/query` | any | Ask a natural-language question about roles, policies, or users |
| `GET` | `/policy/roles/{realm}` | any | All realm-level roles |
| `GET` | `/policy/clients/{realm}` | any | All clients in the realm |
| `GET` | `/policy/user/{realm}/{username}` | any | Roles and groups for a user |

#### `POST /policy/query` — request body

```json
{
  "question": "What can a client-admin access?",
  "realm": "your-realm",
  "llm_provider": "openai"
}
```

#### `POST /policy/query` — response

```json
{
  "status": "success",
  "question": "What can a client-admin access?",
  "realm": "your-realm",
  "answer": {
    "answer": "Direct one-to-three sentence answer.",
    "details": "Elaboration with specifics from the context.",
    "sources": ["realm role: client-admin", "client: my-app"],
    "missing_data": "None",
    "confidence": "high"
  },
  "context_sources": ["realm_roles", "clients", "authz_my-app"],
  "token_usage": {
    "prompt_tokens": 800,
    "completion_tokens": 300,
    "total_tokens": 1100
  }
}
```

### Core API Proxy

These endpoints proxy directly to the internal Core API (`/v2/clients/customAttributes`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/core/customAttributes?domainUrl=<domain>` | any | Fetch SSO attributes for a domain |
| `POST` | `/core/customAttributes?domainUrl=<domain>` | admin | Create SSO attributes (fails with 409 if already exists) |
| `PUT` | `/core/customAttributes?domainUrl=<domain>` | admin | Upsert SSO attributes (create or update) |

## UI Sidebar Reference

| Section | Item | Role | Description |
|---------|------|------|-------------|
| Manage | Get IDP by Domain | any | Look up one IDP; supports email input (domain auto-extracted); inline edit and clone |
| Manage | Add My IDP | any | Self-service onboard — pre-fills domain from logged-in user's email |
| Observe | Token Usage | any | Token consumption and cost dashboard |
| Observe | Certificates | any | Certificate expiry status and rotation |
| Actions | Onboard New IDP | admin | Full agent-assisted onboard flow |
| Actions | Update IDP | admin | Fetch and edit an existing IDP |
| Intelligence | Policy Assistant | any | Natural-language query engine for Keycloak roles, policies, and users |

### Get IDP by Domain — inline actions

After a successful domain lookup, two actions are available:

- **✎ Edit** — opens an inline form pre-filled with the current SAML attributes; changes are submitted to `POST /update`
- **⎘ Clone** — copies all SAML attributes (entity ID, SSO URL, SLO URL, certificate, protocol) into a new onboard form; the email domain field is intentionally left blank so you must supply new domains before submitting to `POST /onboard`

### Policy Assistant — answer card anatomy

Each answer in the history shows:

- **Question** — the question asked, with realm label
- **Direct answer** — one-to-three sentence highlighted block
- **Details** — elaboration with specific names and values from context
- **Source tags** — each Keycloak entity cited (e.g. `realm role: client-admin`, `client: my-app`)
- **Confidence badge** — `high` / `medium` / `low` based on how well the context covered the question
- **Missing data** — note on what additional context would improve the answer (shown only when applicable)
- **Token footer** — prompt + completion token counts and the context keys that were fetched

## Extending

- Add new required fields in `skill.py` → `IDP_SKILL_SCHEMA`
- Add new validation rules in `skill.py` → `VALIDATION_RULES`
- Add more simulation steps in `tools.py` → `simulate_auth_flow()`
- Extend to support OIDC by adding OIDC-specific tools
- Add cost rates for new models in `tools.py` → `log_llm_usage()`
- Add new context sources to `keycloak_admin.py` → `build_context()` for richer policy queries
