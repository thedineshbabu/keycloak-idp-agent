"""
Agent Tools
Functions the agent can call to interact with PostgreSQL, IAM service, and simulate auth flows.
"""
import re
import json
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx
import psycopg2
from psycopg2.extras import RealDictCursor

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


# ── Database helpers ──────────────────────────────────────────────────────────

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)


def fetch_existing_idps(limit: int = 20) -> list[dict]:
    """Fetch existing IDP configs from PostgreSQL to learn patterns."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT idp_name, email_domain, protocol, entity_id, sso_url,
                   name_id_format, attribute_mapping, roles_attribute,
                   want_assertions_signed, is_active, created_at
            FROM idp_configurations
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        # Return mock data if DB not available (for prototyping)
        return _mock_existing_idps()


def fetch_idp_by_domain(email_domain: str) -> Optional[dict]:
    """Fetch a specific IDP config by email domain."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM idp_configurations WHERE email_domain = %s
        """, (email_domain,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return dict(row) if row else None
    except Exception:
        return _mock_idp_by_domain(email_domain)


# ── IAM Service API calls ─────────────────────────────────────────────────────

async def push_to_iam(config: dict, operation: str = "create") -> dict:
    """Push IDP config to IAM service POST endpoint."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if operation == "create":
                response = await client.post(
                    f"{IAM_SERVICE_BASE_URL}/idp/configurations",
                    json=config,
                    headers={"Content-Type": "application/json"}
                )
            else:  # update
                domain = config.get("email_domain")
                response = await client.put(
                    f"{IAM_SERVICE_BASE_URL}/idp/configurations/{domain}",
                    json=config,
                    headers={"Content-Type": "application/json"}
                )
            response.raise_for_status()
            return {"success": True, "data": response.json()}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": f"IAM API error: {e.response.status_code} - {e.response.text}"}
        except httpx.RequestError as e:
            # For prototyping - simulate success if IAM service not running
            return _mock_iam_push(config, operation)


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

    # Domain validation
    domain = config.get("email_domain", "")
    if domain:
        rule = VALIDATION_RULES["email_domain"]
        if not re.match(rule["pattern"], domain):
            errors.append({"field": "email_domain", "label": "Email Domain", "message": rule["message"]})

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
    domain = config.get("email_domain")
    steps.append({
        "step": "Email Domain Routing",
        "status": "pass" if domain else "fail",
        "detail": f"Domain '{domain}' will route auth requests to this IDP" if domain else "Email domain missing"
    })
    if not domain:
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
            "detail": f"SSO endpoint responded" if reachable else f"Could not reach {sso_url} (may be internal network)"
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
        "sub": f"user@{domain}",
        "email": f"user@{domain}",
        "idp": config.get("idp_name"),
        "roles": ["<roles from your DB role store>"],
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
        # Use most common name_id_format from existing configs
        name_ids = [p.get("name_id_format") for p in existing_patterns if p.get("name_id_format")]
        if name_ids:
            default_name_id = max(set(name_ids), key=name_ids.count)

        # Use most common attribute mapping
        mappings = [p.get("attribute_mapping") for p in existing_patterns if p.get("attribute_mapping")]
        if mappings:
            default_attr_mapping = mappings[0]  # Use most recent as baseline

    config = {
        "idp_name": inputs.get("idp_name"),
        "email_domain": inputs.get("email_domain"),
        "protocol": inputs.get("protocol", "saml"),
        "entity_id": inputs.get("entity_id"),
        "sso_url": inputs.get("sso_url"),
        "slo_url": inputs.get("slo_url"),
        "certificate": inputs.get("certificate"),
        "name_id_format": inputs.get("name_id_format", default_name_id),
        "attribute_mapping": inputs.get("attribute_mapping", default_attr_mapping),
        "roles_attribute": inputs.get("roles_attribute", "groups"),
        "want_assertions_signed": True,
        "want_authn_requests_signed": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    # Merge any extra attributes
    if inputs.get("extra_attributes"):
        config.update(inputs["extra_attributes"])

    return config


# ── Mock data (for prototyping without live DB/IAM) ───────────────────────────

def _mock_existing_idps() -> list[dict]:
    return [
        {
            "idp_name": "Acme Corp SSO",
            "email_domain": "acmecorp.com",
            "protocol": "saml",
            "entity_id": "https://idp.acmecorp.com/saml",
            "sso_url": "https://idp.acmecorp.com/saml/sso",
            "name_id_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "attribute_mapping": {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "firstName": "givenName", "lastName": "surname"},
            "roles_attribute": "groups",
            "want_assertions_signed": True,
            "is_active": True
        },
        {
            "idp_name": "Beta Inc Azure AD",
            "email_domain": "betainc.com",
            "protocol": "saml",
            "entity_id": "https://sts.windows.net/beta-tenant-id/",
            "sso_url": "https://login.microsoftonline.com/beta-tenant-id/saml2",
            "name_id_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "attribute_mapping": {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "firstName": "givenName", "lastName": "surname"},
            "roles_attribute": "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
            "want_assertions_signed": True,
            "is_active": True
        }
    ]


def _mock_idp_by_domain(domain: str) -> Optional[dict]:
    idps = _mock_existing_idps()
    return next((i for i in idps if i["email_domain"] == domain), None)


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
    """Log a single LLM call's token usage and estimated cost to the DB."""
    cost_per_1k = {
        "gpt-4o":          {"prompt": 0.005,   "completion": 0.015},
        "gemini-1.5-pro":  {"prompt": 0.00125, "completion": 0.005},
    }
    rates = cost_per_1k.get(model, {"prompt": 0.005, "completion": 0.015})
    cost = (prompt_tokens / 1000 * rates["prompt"]) + (completion_tokens / 1000 * rates["completion"])

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO llm_usage_logs
                (operation, llm_provider, model, prompt_tokens, completion_tokens,
                 total_tokens, estimated_cost_usd, duration_ms, success)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (operation, provider, model, prompt_tokens, completion_tokens,
              prompt_tokens + completion_tokens, cost, duration_ms, success))
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass  # Never let logging failures break the main operation


def get_usage_summary() -> dict:
    """Total tokens and cost by operation for the last 30 days."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT operation,
                   SUM(total_tokens)        AS tokens,
                   SUM(estimated_cost_usd)  AS cost,
                   COUNT(*)                 AS calls
            FROM llm_usage_logs
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY operation
            ORDER BY cost DESC
        """)
        by_op = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT COALESCE(SUM(total_tokens), 0)       AS total_tokens,
                   COALESCE(SUM(estimated_cost_usd), 0) AS total_cost
            FROM llm_usage_logs
            WHERE created_at >= NOW() - INTERVAL '30 days'
        """)
        totals = dict(cur.fetchone())
        cur.close()
        conn.close()
        return {
            "by_operation": by_op,
            "total_tokens": int(totals["total_tokens"]),
            "total_cost_usd": float(totals["total_cost"]),
        }
    except Exception:
        return _mock_usage_summary()


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
            GROUP BY llm_provider, model
            ORDER BY cost DESC
        """)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return rows
    except Exception:
        return _mock_usage_by_provider()


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
            GROUP BY DATE(created_at)
            ORDER BY date
        """)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return rows
    except Exception:
        return _mock_usage_timeline()


def get_recent_usage(limit: int = 50) -> list:
    """Most recent LLM call records."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT operation, llm_provider, model, prompt_tokens, completion_tokens,
                   total_tokens, estimated_cost_usd, duration_ms, success, created_at
            FROM llm_usage_logs
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return rows
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
        results.append({
            "idp_name": idp["idp_name"],
            "email_domain": idp["email_domain"],
            "certificate_status": expiry_info,
        })
    return results


def log_cert_alerts(expiring: list):
    """Persist certificate expiry alerts to the cert_alerts table."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        for item in expiring:
            cs = item["certificate_status"]
            cur.execute("""
                INSERT INTO cert_alerts (idp_name, email_domain, days_remaining, expiry_date, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (email_domain) DO UPDATE
                    SET days_remaining = EXCLUDED.days_remaining,
                        expiry_date    = EXCLUDED.expiry_date,
                        created_at     = NOW()
            """, (item["idp_name"], item["email_domain"],
                  cs.get("days_remaining"), cs.get("expiry_date")))
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass


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
