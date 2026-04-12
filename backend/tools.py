"""
Agent Tools
Functions the agent can call to interact with PostgreSQL, IAM service, and simulate auth flows.
"""
import re
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx

from skill import VALIDATION_RULES

# ── Config ────────────────────────────────────────────────────────────────────
import os

DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME",     "iam_db"),
    "user":     os.getenv("DB_USER",     "iam_user"),
    "password": os.getenv("DB_PASSWORD", "iam_pass"),
}

IAM_SERVICE_BASE_URL = os.getenv("IAM_SERVICE_BASE_URL", "http://localhost:8080/api/v1")

CORE_API_BASE_URL    = os.getenv("CORE_API_BASE_URL", "")
CORE_API_BEARER_TOKEN = os.getenv("CORE_API_BEARER_TOKEN", "")


# ── Database helpers ──────────────────────────────────────────────────────────

def get_db_connection():
    """Return a psycopg2 connection with search_path set to idp_agent,public."""
    import psycopg2
    from psycopg2.extras import RealDictCursor
    conn = psycopg2.connect(
        **DB_CONFIG,
        cursor_factory=RealDictCursor,
        options="-c search_path=idp_agent,public",
    )
    return conn


# ── Chat history helpers ──────────────────────────────────────────────────────

def save_chat_message(session_id: str, user_sub: str, user_email: str,
                      role: str, message: str) -> None:
    """Persist a single chat turn (role = 'user' | 'assistant') to PostgreSQL."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO chat_history (session_id, user_sub, user_email, role, message)
               VALUES (%s, %s, %s, %s, %s)""",
            (session_id, user_sub, user_email or "", role, message),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass


def get_chat_sessions(user_sub: str, limit: int = 30) -> list[dict]:
    """Return recent sessions for a user with a first-message preview."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT
                session_id,
                MIN(created_at)  AS started_at,
                COUNT(*)         AS message_count,
                (SELECT message FROM chat_history c2
                 WHERE c2.session_id = c1.session_id AND c2.role = 'user'
                 ORDER BY c2.created_at ASC LIMIT 1) AS preview
            FROM chat_history c1
            WHERE user_sub = %s
            GROUP BY session_id
            ORDER BY started_at DESC
            LIMIT %s
        """, (user_sub, limit))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def get_session_messages(session_id: str, user_sub: str) -> list[dict]:
    """Return all messages in a session, verifying ownership."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT role, message, created_at
            FROM chat_history
            WHERE session_id = %s AND user_sub = %s
            ORDER BY created_at ASC
        """, (session_id, user_sub))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def get_daily_query_count(user_sub: str) -> int:
    """Count today's user-initiated messages (role='user') in chat_history."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM chat_history
            WHERE user_sub = %s
              AND role = 'user'
              AND created_at >= CURRENT_DATE
        """, (user_sub,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row["cnt"] if row else 0
    except Exception:
        return 0


def fetch_existing_idps(limit: int = 20) -> list[dict]:
    """Return existing IDP configs to learn patterns (mock data for now; live data comes from Core API)."""
    return _mock_existing_idps()


def fetch_idp_by_domain(email_domain: str, token: Optional[str] = None) -> Optional[dict]:
    """
    Fetch a specific IDP config by domain.
    Priority: Core API custom attributes → mock fallback.
    Passes the caller's access token to the Core API when available.
    """
    try:
        core_result = asyncio.get_event_loop().run_until_complete(
            core_get_domain_attributes(email_domain, token)
        )
        if core_result:
            return core_result
    except Exception:
        pass

    return _mock_idp_by_domain(email_domain)


# ── IAM Service API calls ─────────────────────────────────────────────────────

async def push_to_iam(config: dict, operation: str = "create", token: Optional[str] = None) -> dict:
    """
    Push IDP config to both the IAM service and the Core API custom-attributes endpoint.
    Core API uses PUT (upsert) for both create and update so callers don't need to
    distinguish whether attributes already exist.
    """
    iam_result: dict = {}
    core_result: dict = {}

    # ── 1. IAM service ────────────────────────────────────────────────────────
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if operation == "create":
                response = await client.post(
                    f"{IAM_SERVICE_BASE_URL}/idp/configurations",
                    json=config,
                    headers={"Content-Type": "application/json"},
                )
            else:
                domain = config.get("email_domain")
                response = await client.put(
                    f"{IAM_SERVICE_BASE_URL}/idp/configurations/{domain}",
                    json=config,
                    headers={"Content-Type": "application/json"},
                )
            response.raise_for_status()
            iam_result = {"success": True, "data": response.json()}
        except httpx.HTTPStatusError as e:
            iam_result = {"success": False,
                          "error": f"IAM API error: {e.response.status_code} - {e.response.text}"}
        except httpx.RequestError:
            iam_result = _mock_iam_push(config, operation)

    # ── 2. Core API — upsert custom attributes ────────────────────────────────
    domains = config.get("email_domains") or []
    if isinstance(domains, str):
        domains = [domains]
    primary_domain = domains[0] if domains else config.get("email_domain", "")
    if primary_domain and token:
        core_result = await core_upsert_domain_attributes(primary_domain, config, token)

    # Overall success: IAM must succeed; Core API is best-effort
    return {
        "success": iam_result.get("success", False),
        "iam": iam_result,
        "core_api": core_result if core_result else {"skipped": "no token available for Core API"},
    }


# ── Validation ────────────────────────────────────────────────────────────────

def validate_idp_config(config: dict, protocol: str = "saml") -> dict:
    """Validate an IDP config against the skill schema."""
    from skill import IDP_SKILL_SCHEMA
    errors = []
    warnings = []

    schema = IDP_SKILL_SCHEMA.get(protocol, {})
    required_fields = schema.get("required", [])

    # Check required fields
    for field_def in required_fields:
        field = field_def["field"]
        value = config.get(field)
        if not value:
            errors.append({
                "field": field,
                "label": field_def["label"],
                "message": f"'{field_def['label']}' is required",
                "description": field_def.get("description", ""),
                "example": field_def.get("example", "")
            })
            continue

        # Type-specific validation
        field_type = field_def.get("type")
        if field_type == "url":
            rule = VALIDATION_RULES["url"]
            if not re.match(rule["pattern"], str(value)):
                errors.append({"field": field, "label": field_def["label"], "message": rule["message"]})

        if field_type == "certificate":
            rule = VALIDATION_RULES["certificate"]
            clean_cert = value.replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").replace("\n", "")
            if len(clean_cert) < rule["min_length"]:
                warnings.append({"field": field, "message": rule["message"]})

        if field_type == "array":
            domains = value if isinstance(value, list) else [value]
            rule = VALIDATION_RULES["email_domain"]
            for d in domains:
                if not re.match(rule["pattern"], str(d)):
                    errors.append({"field": field, "label": field_def["label"],
                                   "message": f"'{d}': {rule['message']}"})

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }


# ── Auth Flow Simulator ───────────────────────────────────────────────────────

async def simulate_auth_flow(config: dict) -> dict:
    """
    Simulate the custom Keycloak auth flow:
    1. Extract email domain from config
    2. Verify SAML attributes are stored / will be stored correctly
    3. Check that attribute mapping is consistent
    4. Validate certificate format
    5. Verify SSO URL is reachable (HEAD request)
    """
    steps = []
    passed = True

    # Step 1: Email domain routing check
    domains = config.get("email_domains") or []
    if isinstance(domains, str):
        domains = [domains]
    domain = domains[0] if domains else None
    steps.append({
        "step": "Email Domain Routing",
        "status": "pass" if domains else "fail",
        "detail": f"Domains {domains} will route auth requests to this IDP" if domains else "Email domains missing"
    })
    if not domains:
        passed = False

    # Step 2: SAML attribute mapping check
    attr_mapping = config.get("attribute_mapping", {})
    expected_attrs = ["email", "firstName", "lastName"]
    missing_attrs = [a for a in expected_attrs if a not in attr_mapping]
    steps.append({
        "step": "Attribute Mapping Check",
        "status": "warn" if missing_attrs else "pass",
        "detail": f"Missing recommended mappings: {missing_attrs}" if missing_attrs else "All recommended attributes mapped"
    })

    # Step 3: Certificate validation
    cert = config.get("certificate", "")
    cert_clean = cert.replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").replace("\n", "").strip()
    cert_valid = len(cert_clean) > 100
    steps.append({
        "step": "Certificate Format Check",
        "status": "pass" if cert_valid else "fail",
        "detail": "Certificate format looks valid" if cert_valid else "Certificate too short or malformed"
    })
    if not cert_valid:
        passed = False

    # Step 4: SSO URL reachability check
    sso_url = config.get("sso_url", "")
    if sso_url:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.head(sso_url, follow_redirects=True)
                reachable = resp.status_code < 500
        except Exception:
            reachable = False  # Treat as warning, not failure in prototype

        steps.append({
            "step": "SSO URL Reachability",
            "status": "pass" if reachable else "warn",
            "detail": "SSO endpoint responded" if reachable else f"Could not reach {sso_url} (may be internal network)"
        })
    else:
        steps.append({
            "step": "SSO URL Reachability",
            "status": "fail",
            "detail": "SSO URL not provided"
        })
        passed = False

    # Step 5: JWT enrichment simulation
    simulated_token_claims = {
        "sub": f"user@{domain or 'unknown'}",
        "email": f"user@{domain or 'unknown'}",
        "idp": config.get("idp_name"),
        "iss": "keycloak",
        "iat": int(datetime.now(timezone.utc).timestamp())
    }
    steps.append({
        "step": "JWT Token Enrichment Simulation",
        "status": "pass",
        "detail": "Token claims would be enriched with roles from your external DB",
        "sample_claims": simulated_token_claims
    })

    return {
        "simulation_passed": passed,
        "steps": steps,
        "summary": "Auth flow simulation passed. Config is ready to deploy." if passed else "Simulation failed. Fix errors before deploying."
    }


# ── Config Generator ──────────────────────────────────────────────────────────

def generate_idp_config(inputs: dict, existing_patterns: list[dict]) -> dict:
    """
    Generate a complete IDP config from user inputs,
    using existing patterns from the DB to fill defaults intelligently.
    """
    # Learn defaults from existing configs
    default_name_id = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    default_attr_mapping = {
        "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "firstName": "givenName",
        "lastName": "surname"
    }

    if existing_patterns:
        name_ids = [p.get("name_id_format") for p in existing_patterns if p.get("name_id_format")]
        if name_ids:
            default_name_id = max(set(name_ids), key=name_ids.count)
        mappings = [p.get("attribute_mapping") for p in existing_patterns if p.get("attribute_mapping")]
        if mappings:
            default_attr_mapping = mappings[0]

    # Normalise email_domains — accept list or comma-separated string
    raw_domains = inputs.get("email_domains") or []
    if isinstance(raw_domains, str):
        raw_domains = [d.strip() for d in raw_domains.split(",") if d.strip()]
    email_domains = raw_domains

    config = {
        "idp_name": inputs.get("idp_name"),
        "email_domains": email_domains,
        "protocol": inputs.get("protocol", "saml"),
        "entity_id": inputs.get("entity_id"),
        "sso_url": inputs.get("sso_url"),
        "slo_url": inputs.get("slo_url"),
        "certificate": inputs.get("certificate"),
        "name_id_format": inputs.get("name_id_format", default_name_id),
        "attribute_mapping": inputs.get("attribute_mapping", default_attr_mapping),
        "want_assertions_signed": True,
        "want_authn_requests_signed": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    if inputs.get("extra_attributes"):
        config.update(inputs["extra_attributes"])

    return config


# ── Core API Client (/v2/clients/customAttributes) ───────────────────────────
# Maps to the KFOne Core API Postman collection endpoints:
#   GET  /v2/clients/customAttributes?domainUrl=…  → getDomainAttributes
#   POST /v2/clients/customAttributes?domainUrl=…  → createClientCustomAttributes
#   PUT  /v2/clients/customAttributes?domainUrl=…  → upsertClientCustomAttributes

def _core_headers(token: Optional[str] = None) -> dict:
    # Always use the logged-in user's access token.
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    return hdrs


def _idp_to_core_payload(config: dict) -> dict:
    """Map internal IDP config fields → Core API custom-attributes payload."""
    _map = {
        "idpEntityId":                 config.get("entity_id"),
        "singleSignOnServiceUrl":      config.get("sso_url"),
        "singleLogoutServiceUrl":      config.get("slo_url"),
        "idpX509Cert":                 config.get("certificate"),
        "assertionSigned":             config.get("want_assertions_signed"),
        "authnRequestsSigned":         config.get("want_authn_requests_signed"),
        # passthrough fields that live on the SP side
        "entityId":                    config.get("sp_entity_id"),
        "assertionConsumerServiceUrl": config.get("acs_url"),
        "spX509Cert":                  config.get("sp_certificate"),
        "privateKey":                  config.get("sp_private_key"),
        "validateSignature":           config.get("validate_signature"),
        "assertionEncrypted":          config.get("assertion_encrypted"),
    }
    # Omit keys whose value is None so the API only receives explicit fields
    return {k: v for k, v in _map.items() if v is not None}


def _core_to_idp_config(resp: dict, domain_url: str) -> dict:
    """Map Core API custom-attributes response → internal IDP config fields."""
    return {
        "email_domains":              [domain_url],
        "entity_id":                  resp.get("idpEntityId"),
        "sso_url":                    resp.get("singleSignOnServiceUrl"),
        "slo_url":                    resp.get("singleLogoutServiceUrl"),
        "certificate":                resp.get("idpX509Cert"),
        "want_assertions_signed":     resp.get("assertionSigned", False),
        "want_authn_requests_signed": resp.get("authnRequestsSigned", False),
        # SP-side fields — kept as-is under new names
        "sp_entity_id":               resp.get("entityId"),
        "acs_url":                    resp.get("assertionConsumerServiceUrl"),
        "sp_certificate":             resp.get("spX509Cert"),
        "sp_private_key":             resp.get("privateKey"),
        "validate_signature":         resp.get("validateSignature", False),
        "assertion_encrypted":        resp.get("assertionEncrypted", False),
        "protocol":                   "saml",
    }


async def core_get_domain_attributes(domain_url: str, token: Optional[str] = None) -> Optional[dict]:
    """
    GET /v2/clients/customAttributes?domainUrl=<domain_url>
    Returns the mapped IDP config dict on 200, None on 404.
    Raises httpx.HTTPStatusError for any other HTTP error (401, 403, 500, …)
    so callers can surface the real failure instead of silently returning None.
    """
    import logging
    log = logging.getLogger("core_api")
    if not CORE_API_BASE_URL:
        return None
    url = f"{CORE_API_BASE_URL}/v2/clients/customAttributes"
    hdrs = _core_headers(token)
    log.warning("core_get_domain_attributes: GET %s?domainUrl=%s auth=%s",
                url, domain_url, "yes" if hdrs.get("Authorization") else "no")
    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        resp = await client.get(url, params={"domainUrl": domain_url}, headers=hdrs)
        log.warning("core_get_domain_attributes: status=%s body_start=%s",
                    resp.status_code, resp.text[:120])
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return _core_to_idp_config(resp.json(), domain_url)


async def core_create_domain_attributes(domain_url: str, config: dict, token: Optional[str] = None) -> dict:
    """
    POST /v2/clients/customAttributes?domainUrl=<domain_url>
    Creates new SSO attributes.  Returns 409 if any attribute already exists.
    """
    url = f"{CORE_API_BASE_URL}/v2/clients/customAttributes"
    payload = _idp_to_core_payload(config)
    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        try:
            resp = await client.post(url, params={"domainUrl": domain_url},
                                     json=payload, headers=_core_headers(token))
            resp.raise_for_status()
            return {"success": True, "status_code": resp.status_code, "data": resp.json()}
        except httpx.HTTPStatusError as e:
            return {"success": False, "status_code": e.response.status_code,
                    "error": e.response.text}
        except httpx.RequestError as e:
            return {"success": False, "error": str(e)}


async def core_upsert_domain_attributes(domain_url: str, config: dict, token: Optional[str] = None) -> dict:
    """
    PUT /v2/clients/customAttributes?domainUrl=<domain_url>
    Creates missing attributes and updates changed ones (upsert).
    Body status_code 201 = created, 200 = updated/up-to-date.
    """
    url = f"{CORE_API_BASE_URL}/v2/clients/customAttributes"
    payload = _idp_to_core_payload(config)
    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        try:
            resp = await client.put(url, params={"domainUrl": domain_url},
                                    json=payload, headers=_core_headers(token))
            resp.raise_for_status()
            body = resp.json()
            return {"success": True, "status_code": body.get("status_code", resp.status_code),
                    "message": body.get("message", ""), "data": body}
        except httpx.HTTPStatusError as e:
            return {"success": False, "status_code": e.response.status_code,
                    "error": e.response.text}
        except httpx.RequestError as e:
            return {"success": False, "error": str(e)}


# ── Mock data (for prototyping without live DB/IAM) ───────────────────────────

def _mock_existing_idps() -> list[dict]:
    return [
        {
            "idp_name": "Acme Corp SSO",
            "email_domains": ["acmecorp.com", "acme-subsidiary.com"],
            "protocol": "saml",
            "entity_id": "https://idp.acmecorp.com/saml",
            "sso_url": "https://idp.acmecorp.com/saml/sso",
            "name_id_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "attribute_mapping": {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "firstName": "givenName", "lastName": "surname"},
            "want_assertions_signed": True,
            "is_active": True
        },
        {
            "idp_name": "Beta Inc Azure AD",
            "email_domains": ["betainc.com"],
            "protocol": "saml",
            "entity_id": "https://sts.windows.net/beta-tenant-id/",
            "sso_url": "https://login.microsoftonline.com/beta-tenant-id/saml2",
            "name_id_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "attribute_mapping": {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "firstName": "givenName", "lastName": "surname"},
            "want_assertions_signed": True,
            "is_active": True
        }
    ]


def _mock_idp_by_domain(domain: str) -> Optional[dict]:
    idps = _mock_existing_idps()
    return next((i for i in idps if domain in i.get("email_domains", [])), None)


def _mock_iam_push(config: dict, operation: str) -> dict:
    return {
        "success": True,
        "data": {
            "message": f"[MOCK] IDP '{config.get('idp_name')}' {operation}d successfully",
            "idp_id": "mock-idp-001",
            "email_domain": config.get("email_domain")
        }
    }


# ── LLM Usage Logging (Item 1) ────────────────────────────────────────────────

def log_llm_usage(operation: str, provider: str, model: str, prompt_tokens: int,
                  completion_tokens: int, duration_ms: int, success: bool):
    """Log a single LLM call's token usage and estimated cost."""
    cost_per_1k = {
        "gpt-4o":           {"prompt": 0.005,    "completion": 0.015},
        "gemini-2.0-flash": {"prompt": 0.000075, "completion": 0.0003},
    }
    rates = cost_per_1k.get(model, {"prompt": 0.005, "completion": 0.015})
    cost = (prompt_tokens / 1000 * rates["prompt"]) + (completion_tokens / 1000 * rates["completion"])
    total = prompt_tokens + completion_tokens

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO llm_usage_logs
                (operation, llm_provider, model, prompt_tokens, completion_tokens,
                 total_tokens, estimated_cost_usd, duration_ms, success)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (operation, provider, model, prompt_tokens, completion_tokens,
              total, cost, duration_ms, success))
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass  # Never let logging failures break the main operation


def _rows_to_dicts(rows) -> list[dict]:
    return [dict(r) for r in rows]


def get_usage_summary() -> dict:
    """Total tokens and cost by operation for the last 30 days."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT operation,
                   SUM(total_tokens)       AS tokens,
                   SUM(estimated_cost_usd) AS cost,
                   COUNT(*)                AS calls
            FROM llm_usage_logs
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY operation ORDER BY cost DESC
        """)
        by_op = _rows_to_dicts(cur.fetchall())
        cur.execute("""
            SELECT COALESCE(SUM(total_tokens),0)      AS total_tokens,
                   COALESCE(SUM(estimated_cost_usd),0) AS total_cost
            FROM llm_usage_logs
            WHERE created_at >= NOW() - INTERVAL '30 days'
        """)
        totals = dict(cur.fetchone())
        cur.close()
        conn.close()
        return {
            "by_operation":  by_op,
            "total_tokens":  int(totals["total_tokens"]),
            "total_cost_usd": float(totals["total_cost"]),
        }
    except Exception:
        return {"by_operation": [], "total_tokens": 0, "total_cost_usd": 0.0}


def get_usage_by_provider() -> list:
    """Token and cost breakdown by LLM provider + model."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT llm_provider, model,
                   SUM(total_tokens)       AS tokens,
                   SUM(estimated_cost_usd) AS cost,
                   COUNT(*)                AS calls
            FROM llm_usage_logs
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY llm_provider, model ORDER BY cost DESC
        """)
        rows = _rows_to_dicts(cur.fetchall())
        cur.close()
        conn.close()
        return rows
    except Exception:
        return []


def get_usage_timeline() -> list:
    """Daily token usage over the last 30 days."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DATE(created_at) AS date,
                   SUM(total_tokens)       AS tokens,
                   SUM(estimated_cost_usd) AS cost
            FROM llm_usage_logs
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at) ORDER BY date
        """)
        rows = _rows_to_dicts(cur.fetchall())
        cur.close()
        conn.close()
        return [{"date": str(r["date"]), "tokens": r["tokens"], "cost": r["cost"]} for r in rows]
    except Exception:
        return []


def get_recent_usage(limit: int = 50) -> list:
    """Most recent LLM call records."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT operation, llm_provider, model, prompt_tokens, completion_tokens,
                   total_tokens, estimated_cost_usd, duration_ms, success, created_at
            FROM llm_usage_logs ORDER BY created_at DESC LIMIT %s
        """, (limit,))
        rows = _rows_to_dicts(cur.fetchall())
        cur.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


# ── Certificate Scanning (Item 3) ────────────────────────────────────────────

def parse_certificate_expiry(cert_pem: str) -> dict:
    """Parse a PEM or raw base64 certificate and return expiry info."""
    try:
        from cryptography import x509 as _x509
        from cryptography.hazmat.backends import default_backend

        if "BEGIN CERTIFICATE" not in cert_pem:
            cert_pem = f"-----BEGIN CERTIFICATE-----\n{cert_pem}\n-----END CERTIFICATE-----"
        cert = _x509.load_pem_x509_certificate(cert_pem.encode(), default_backend())
        expiry = cert.not_valid_after_utc
        days_remaining = (expiry - datetime.now(timezone.utc)).days
        return {
            "expiry_date": expiry.isoformat(),
            "days_remaining": days_remaining,
            "subject": cert.subject.rfc4514_string(),
            "issuer": cert.issuer.rfc4514_string(),
            "status": "critical" if days_remaining < 14 else "warning" if days_remaining < 30 else "ok",
        }
    except Exception as e:
        return {"error": str(e), "status": "unknown"}


def scan_all_certificates() -> list[dict]:
    """Scan all IDP configs and return certificate expiry status for each."""
    idps = fetch_existing_idps()
    results = []
    for idp in idps:
        cert = idp.get("certificate") or idp.get("signing_certificate")
        if cert:
            expiry_info = parse_certificate_expiry(cert)
        else:
            expiry_info = {"status": "no_cert", "message": "No certificate configured"}
        domains = idp.get("email_domains") or []
        if isinstance(domains, str):
            domains = [domains]
        results.append({
            "idp_name": idp["idp_name"],
            "email_domains": domains,
            "certificate_status": expiry_info,
        })
    return results


# ── Mock usage data (for prototyping without live DB) ────────────────────────

def _mock_usage_summary() -> dict:
    return {
        "by_operation": [
            {"operation": "onboard_idp", "tokens": 12500, "cost": 0.125,  "calls": 8},
            {"operation": "chat",        "tokens": 8200,  "cost": 0.062,  "calls": 34},
            {"operation": "update_idp",  "tokens": 4100,  "cost": 0.041,  "calls": 5},
        ],
        "total_tokens": 24800,
        "total_cost_usd": 0.228,
    }


def _mock_usage_by_provider() -> list:
    return [
        {"llm_provider": "openai",  "model": "gpt-4o",         "tokens": 18600, "cost": 0.186, "calls": 32},
        {"llm_provider": "gemini",  "model": "gemini-1.5-pro",  "tokens": 6200,  "cost": 0.042, "calls": 15},
    ]


def _mock_usage_timeline() -> list:
    today = datetime.now(timezone.utc).date()
    return [
        {"date": str(today - timedelta(days=6)), "tokens": 3200, "cost": 0.032},
        {"date": str(today - timedelta(days=5)), "tokens": 5600, "cost": 0.056},
        {"date": str(today - timedelta(days=4)), "tokens": 2100, "cost": 0.021},
        {"date": str(today - timedelta(days=3)), "tokens": 6800, "cost": 0.068},
        {"date": str(today - timedelta(days=2)), "tokens": 4200, "cost": 0.042},
        {"date": str(today - timedelta(days=1)), "tokens": 1900, "cost": 0.019},
        {"date": str(today),                     "tokens": 1000, "cost": 0.010},
    ]
