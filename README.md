# Keycloak IDP Onboarding Agent

An agentic AI system for onboarding and managing client IDPs in your custom Keycloak setup.

## Architecture

```
React UI  →  FastAPI Backend  →  Agent Core  →  Tools
                                     ↓
                              OpenAI / Gemini LLM
                                     ↓
                         PostgreSQL  |  IAM Service API  |  Auth Simulator
```

## Features

- **Onboard new IDPs** — Agent validates inputs against the IDP skill schema, fetches existing patterns from your DB, generates a complete config, simulates the auth flow, and pushes to your IAM service
- **Update existing IDPs** — Fetch current config by email domain, apply changes (certificate rotation, URL updates, etc.), validate, and push
- **Smart validation** — Asks for missing required fields before proceeding
- **Auth flow simulation** — Validates routing, attribute mapping, certificate format, SSO URL reachability, and JWT enrichment
- **LLM-powered review** — Uses OpenAI or Gemini to review configs against your existing patterns
- **Token usage dashboard** — Tracks token consumption and estimated cost per operation and model over time
- **Keycloak SSO login** — Optional JWT-based auth protecting write endpoints; role-based UI (admin vs viewer)
- **Certificate rotation** — Scans all IDP certificates for expiry, alerts on certs expiring within 30 days, supports manual rotation from the UI; automated daily scan via APScheduler
- **Mock mode** — Works without a live DB or IAM service for prototyping

## Project Structure

```
keycloak-idp-agent/
├── main.py          # FastAPI app + all endpoints
├── agent.py         # Agent core (LLM orchestration + usage logging)
├── skill.py         # IDP skill schema + system prompt
├── tools.py         # Tool functions (DB, IAM, simulator, usage, certificates)
├── auth.py          # Keycloak JWT validation middleware
├── keycloak.js      # Frontend Keycloak client config
├── App.jsx          # React UI (all views)
└── schema.sql       # PostgreSQL table DDL
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

### Keycloak SSO (optional)

Set environment variables to enable token enforcement:

```bash
export KEYCLOAK_ENABLED=true
export KEYCLOAK_URL=https://your-keycloak-server/auth
export KEYCLOAK_REALM=your-realm
export KEYCLOAK_CLIENT_ID=idp-agent-ui
```

When `KEYCLOAK_ENABLED` is `false` (the default), every request gets a synthetic `agent-admin` context so local development works without a Keycloak instance.

#### Keycloak client setup (one-time)

1. Create a client `idp-agent-ui` in your realm
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
VITE_KEYCLOAK_URL=https://your-keycloak-server/auth
VITE_KEYCLOAK_REALM=your-realm
VITE_KEYCLOAK_CLIENT=idp-agent-ui
```

When enabled, the UI shows the logged-in user's name, a logout button, and hides admin actions (Onboard, Update IDP) from viewer-role users.

## API Reference

### Core

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check |
| `GET` | `/idps` | any | List all IDP configs |
| `POST` | `/onboard` | admin | Onboard a new IDP |
| `POST` | `/update` | admin | Update an existing IDP |
| `POST` | `/chat` | any | Conversational interface |
| `GET` | `/skill/schema` | — | IDP field schema |

### Usage (Item 1)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/usage/summary` | Total tokens + cost by operation (last 30 days) |
| `GET` | `/usage/by-provider` | Breakdown by OpenAI vs Gemini |
| `GET` | `/usage/timeline` | Daily token usage over last 30 days |
| `GET` | `/usage/operations` | Most expensive operations ranked |
| `GET` | `/usage/recent` | 50 most recent LLM call records |

### Certificates (Item 3)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/certificates/scan` | any | Scan all IDPs, return cert status |
| `GET` | `/certificates/expiring` | any | IDPs with certs expiring < 30 days |
| `POST` | `/certificates/rotate` | admin | Push a new certificate to IAM |
| `POST` | `/certificates/schedule-scan` | admin | Check daily scan scheduler status |

## Extending

- Add new required fields in `skill.py` → `IDP_SKILL_SCHEMA`
- Add new validation rules in `skill.py` → `VALIDATION_RULES`
- Add more simulation steps in `tools.py` → `simulate_auth_flow()`
- Extend to support OIDC by adding OIDC-specific tools
- Add cost rates for new models in `tools.py` → `log_llm_usage()`
