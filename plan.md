# Implementation Plan — Top 3 Quick Wins

---

## Item 1: Token Usage Monitoring Dashboard

### Goal
Track LLM token consumption per operation, per model, and over time. Visualize costs in the React UI.

### Backend Changes

#### 1. PostgreSQL — New Table
```sql
CREATE TABLE llm_usage_logs (
    id SERIAL PRIMARY KEY,
    operation VARCHAR(100),        -- e.g. "onboard_idp", "chat", "update_idp"
    llm_provider VARCHAR(50),      -- "openai" or "gemini"
    model VARCHAR(100),            -- "gpt-4o", "gemini-1.5-pro"
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    estimated_cost_usd NUMERIC(10, 6),
    duration_ms INT,
    success BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 2. tools.py — Add logging helper
```python
def log_llm_usage(operation, provider, model, prompt_tokens, completion_tokens, duration_ms, success):
    cost_per_1k = {
        "gpt-4o": {"prompt": 0.005, "completion": 0.015},
        "gemini-1.5-pro": {"prompt": 0.00125, "completion": 0.005}
    }
    rates = cost_per_1k.get(model, {"prompt": 0.005, "completion": 0.015})
    cost = (prompt_tokens / 1000 * rates["prompt"]) + (completion_tokens / 1000 * rates["completion"])
    # Insert into llm_usage_logs table
```

#### 3. agent.py — Wrap LLM calls
- Capture token usage from API response (`usage.prompt_tokens`, `usage.completion_tokens`)
- Record start/end time for duration
- Call `log_llm_usage()` after every LLM call

#### 4. main.py — New endpoints
```
GET /usage/summary        — total tokens and cost by operation (last 30 days)
GET /usage/by-provider    — breakdown by OpenAI vs Gemini
GET /usage/timeline       — daily token usage over time
GET /usage/operations     — most expensive operations ranked
```

### Frontend Changes

#### New "Usage" view in sidebar
- **Summary cards** — total tokens today, total cost this month, most used model
- **Bar chart** — tokens per operation type
- **Line chart** — daily usage over last 30 days
- **Table** — recent LLM calls with operation, model, tokens, cost, duration

### Effort Estimate
- Backend: 2-3 hours
- Frontend: 2 hours
- Total: ~4-5 hours

---

## Item 2: Keycloak SSO Login

### Goal
Protect the agentic app behind Keycloak SSO. Users log in via your existing Keycloak server. Role-based access controls what operations a user can perform.

### Architecture
```
React App  →  Keycloak Login Page  →  JWT Token  →  FastAPI validates token
```

### Keycloak Setup (one-time)
1. Create a new client in Keycloak: `idp-agent-ui`
   - Protocol: `openid-connect`
   - Access Type: `public` (for React SPA)
   - Valid Redirect URIs: `http://localhost:5173/*`
   - Web Origins: `http://localhost:5173`
2. Create roles on the client:
   - `agent-admin` — full access (onboard, update, troubleshoot)
   - `agent-viewer` — read-only (query IDPs, view usage)
3. Assign roles to users

### Frontend Changes

#### Install keycloak-js
```bash
npm install keycloak-js
```

#### src/keycloak.js
```javascript
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'https://your-keycloak-server/auth',
  realm: 'your-realm',
  clientId: 'idp-agent-ui'
});

export default keycloak;
```

#### src/main.jsx — Init Keycloak before render
```javascript
keycloak.init({ onLoad: 'login-required' }).then(authenticated => {
  if (authenticated) ReactDOM.render(<App keycloak={keycloak} />);
});
```

#### App.jsx — Role-based UI
```javascript
const isAdmin = keycloak.hasRealmRole('agent-admin');
const isViewer = keycloak.hasRealmRole('agent-viewer');

// Hide "Run Agent" buttons for viewers
// Show user name and logout in header
```

### Backend Changes

#### Install python-jose
```bash
pip install python-jose[cryptography]
```

#### auth.py — JWT validation middleware
```python
from fastapi import Depends, HTTPException, Header
from jose import jwt

KEYCLOAK_CERTS_URL = "https://your-keycloak/auth/realms/your-realm/protocol/openid-connect/certs"

async def verify_token(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    # Fetch Keycloak public keys and validate JWT
    # Extract roles from token claims
    # Return user context
    return user_context
```

#### Protect endpoints
```python
@app.post("/onboard")
async def onboard_idp(req: OnboardRequest, user=Depends(verify_token)):
    if "agent-admin" not in user["roles"]:
        raise HTTPException(status_code=403, detail="Admin role required")
    ...
```

### Effort Estimate
- Keycloak config: 30 mins
- Frontend auth: 2 hours
- Backend JWT validation: 1.5 hours
- Total: ~4 hours

---

## Item 3: Certificate & Secret Rotation Automation

### Goal
Proactively detect expiring certificates across all client IDPs, alert before they expire, and support manual or automated rotation from the UI.

### Backend Changes

#### tools.py — New tool functions

```python
import ssl
import base64
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from datetime import datetime, timezone, timedelta

def parse_certificate_expiry(cert_pem: str) -> dict:
    """Parse a PEM or base64 certificate and return expiry info."""
    try:
        # Handle both PEM and raw base64
        if "BEGIN CERTIFICATE" not in cert_pem:
            cert_pem = f"-----BEGIN CERTIFICATE-----\n{cert_pem}\n-----END CERTIFICATE-----"
        cert_bytes = cert_pem.encode()
        cert = x509.load_pem_x509_certificate(cert_bytes, default_backend())
        expiry = cert.not_valid_after_utc
        days_remaining = (expiry - datetime.now(timezone.utc)).days
        return {
            "expiry_date": expiry.isoformat(),
            "days_remaining": days_remaining,
            "subject": cert.subject.rfc4514_string(),
            "issuer": cert.issuer.rfc4514_string(),
            "status": "critical" if days_remaining < 14 else "warning" if days_remaining < 30 else "ok"
        }
    except Exception as e:
        return {"error": str(e), "status": "unknown"}


def scan_all_certificates() -> list[dict]:
    """Scan all IDP configs and return certificate status for each."""
    idps = fetch_existing_idps()
    results = []
    for idp in idps:
        cert = idp.get("certificate") or idp.get("signing_certificate")
        if cert:
            expiry_info = parse_certificate_expiry(cert)
            results.append({
                "idp_name": idp["idp_name"],
                "email_domain": idp["email_domain"],
                "certificate_status": expiry_info
            })
    return results
```

#### main.py — New endpoints
```
GET  /certificates/scan          — scan all IDPs and return cert status
GET  /certificates/expiring      — return only IDPs with certs expiring < 30 days
POST /certificates/rotate        — accept new cert for a domain and push to IAM
POST /certificates/schedule-scan — schedule automated daily scans
```

#### Scheduled scanner (APScheduler)
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

@scheduler.scheduled_job('cron', hour=8)  # Run daily at 8am
async def daily_cert_scan():
    results = scan_all_certificates()
    expiring = [r for r in results if r["certificate_status"].get("days_remaining", 999) < 30]
    if expiring:
        # Log to DB, optionally send alert webhook
        log_cert_alerts(expiring)
```

### Frontend Changes

#### New "Certificates" view in sidebar

**Certificate Health Dashboard:**
- **Status grid** — all IDPs with color-coded cert status (green/yellow/red)
- **Expiry timeline** — visual showing which certs expire when
- **Critical alerts** — banner for certs expiring within 14 days

**Rotate Certificate panel:**
- Select IDP by email domain
- Paste new certificate
- Agent validates, simulates, and pushes to IAM
- Confirmation with old vs new expiry dates shown

#### Certificate status card component
```jsx
function CertStatusCard({ idp_name, domain, status }) {
  const color = status === "critical" ? RED : status === "warning" ? AMBER : GREEN;
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: "12px" }}>
      <div>{idp_name} — {domain}</div>
      <div>{status.days_remaining} days remaining</div>
      <div>Expires: {status.expiry_date}</div>
    </div>
  );
}
```

### Install dependency
```bash
pip install cryptography apscheduler
```

### Effort Estimate
- Certificate parsing + scan tool: 2 hours
- Scheduled scanner: 1 hour
- New API endpoints: 1 hour
- Frontend dashboard: 2-3 hours
- Total: ~6-7 hours

---

## Summary

| Item | Effort | Dependencies | Start With |
|------|--------|--------------|------------|
| Token Usage Dashboard | ~4-5 hrs | None — uses existing DB + LLM calls | ✅ Yes |
| Keycloak SSO Login | ~4 hrs | Keycloak client setup | ✅ Yes |
| Certificate Rotation | ~6-7 hrs | `cryptography`, `apscheduler` | After the above two |

**Recommended order:** Token Dashboard → SSO Login → Certificate Rotation