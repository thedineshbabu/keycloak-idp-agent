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
- **Mock mode** — Works without a live DB or IAM service for prototyping

## Project Structure

```
keycloak-idp-agent/
├── backend/
│   ├── main.py          # FastAPI app + endpoints
│   ├── agent.py         # Agent core (LLM orchestration)
│   ├── skill.py         # IDP skill schema + system prompt
│   ├── tools.py         # Tool functions (DB, IAM, simulator)
│   └── requirements.txt
└── frontend/
    └── src/
        └── App.jsx      # React UI
```

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Set environment variables
export OPENAI_API_KEY=your_openai_key
export GEMINI_API_KEY=your_gemini_key

# Optional: configure DB and IAM service
# Edit DB_CONFIG and IAM_SERVICE_BASE_URL in tools.py
# Or leave as-is — mock data is used when services are unavailable

python main.py
# Runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
# Replace src/App.jsx with the provided file
npm run dev
# Runs on http://localhost:5173
```

## Configuration

In `tools.py`, update:
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

## Extending

- Add new required fields in `skill.py` → `IDP_SKILL_SCHEMA`
- Add new validation rules in `skill.py` → `VALIDATION_RULES`
- Add more simulation steps in `tools.py` → `simulate_auth_flow()`
- Extend to support OIDC by adding OIDC-specific tools

## Next Steps

1. Connect to your real PostgreSQL DB
2. Wire up your IAM service endpoints
3. Test against your dev Keycloak instance
4. Add Claude as a third LLM option
5. Add audit logging for all agent actions
