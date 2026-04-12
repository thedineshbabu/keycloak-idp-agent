"""
Unified Chat Engine
Multi-service assistant that answers questions about Keycloak, the IAM platform,
and the Core platform API using LLM function-calling.
Supports OpenAI (gpt-4o) and Gemini (gemini-2.0-flash).
"""
import json
import os
import time
from typing import Optional

import httpx

from datadog_api import (
    _parse_time_range,
    dd_available,
    dd_get_active_monitors,
    dd_query_metrics,
    dd_search_events,
    dd_search_logs,
    dd_search_traces,
)
from keycloak_admin import KeycloakAdminClient
from platform_api import (
    get_active_products,
    get_client_by_id,
    get_client_login_mode,
    get_client_products,
    get_clients,
    get_communities,
    get_roles,
    get_shadow_user_clients,
    get_shadow_users,
    get_user_by_email,
    get_user_details,
    get_user_groups_by_client,
    get_users_by_client,
    lock_unlock_users,
    reset_user_password,
    search_users,
    send_magic_link,
    send_otp,
    update_user_status,
)
from tools import (
    core_create_domain_attributes,
    core_get_domain_attributes,
    core_upsert_domain_attributes,
    get_usage_by_provider,
    get_usage_summary,
    log_llm_usage,
    parse_certificate_expiry,
    scan_all_certificates,
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
DEFAULT_REALM  = os.getenv("KEYCLOAK_REALM", "master")

SYSTEM_PROMPT = """You are a platform intelligence assistant for the Talent Suite platform.

You have live tool access to four services:

1. **Keycloak** — realm roles, clients, authorization policies, users, groups, protocol mappers
   Use for: SSO/SAML configuration, role assignments, token policies, realm structure, JWT claim mappers.

2. **IAM Platform** — platform users, roles, shadow users, communities, user groups
   Use for: user account status, lock/unlock, activate/deactivate, role assignments, cross-client access,
   password resets, magic links, OTP delivery, client-specific user and group lists.

3. **Core Platform** — clients (tenants), products, SSO attributes, login modes
   Use for: tenant lookup by name or ID, licensed products, email-domain login mode, SAML/SSO config,
   creating or updating domain SSO attributes.

4. **Observability** — LLM usage logs stored locally
   Use for: token consumption, estimated cost by operation or provider, usage trends.

Additionally you can query **IDP & Certificate** data:
   Use for: IDP config lookup by email domain, certificate expiry scanning across all IDPs.

Instructions:
- Always call the relevant tools to fetch real data before answering. Never guess.
- For write actions (lock, reset password, send magic link, etc.) confirm the operation succeeded before
  reporting success to the user.
- Quote exact names, IDs, and values from the fetched data.
- If a service is unavailable or a tool returns an error, say so clearly and answer with what you have.
- Be conversational and precise. Use markdown lists or bold text when it adds clarity.
- Cite which service the data came from (e.g. "From Keycloak:" or "IAM shows:").
- For follow-up questions, use the conversation history to avoid re-fetching data already retrieved.
"""

# ── Tool definitions (OpenAI JSON schema format) ──────────────────────────────

_TOOLS = [
    # ── Keycloak ──────────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "keycloak_list_roles",
            "description": "List all realm-level roles in a Keycloak realm. Use for questions about what roles exist or what a role can do.",
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string", "description": "Keycloak realm name"},
                },
                "required": ["realm"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "keycloak_list_clients",
            "description": "List all clients (applications) registered in a Keycloak realm, including whether each has authorization services enabled.",
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string"},
                },
                "required": ["realm"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "keycloak_get_user",
            "description": "Find a user in Keycloak by username or email and return their realm roles, client roles, and group memberships.",
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string"},
                    "username_or_email": {
                        "type": "string",
                        "description": "Username or email address to search for",
                    },
                },
                "required": ["realm", "username_or_email"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "keycloak_list_groups",
            "description": "List all top-level groups in a Keycloak realm.",
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string"},
                },
                "required": ["realm"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "keycloak_get_client_authorization",
            "description": (
                "Get authorization resources, policies, permissions, and scopes for a specific "
                "Keycloak client. The client_uuid is the internal UUID — call keycloak_list_clients "
                "first to find it. Only works when the client has Authorization Services enabled."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string"},
                    "client_uuid": {
                        "type": "string",
                        "description": "Keycloak internal client UUID (the 'id' field from keycloak_list_clients)",
                    },
                },
                "required": ["realm", "client_uuid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "keycloak_get_role_members",
            "description": "List users assigned to a specific realm-level role in Keycloak.",
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string"},
                    "role_name": {"type": "string", "description": "Exact realm role name"},
                },
                "required": ["realm", "role_name"],
            },
        },
    },
    # ── IAM Platform ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "iam_search_users",
            "description": (
                "Look up a user in the IAM platform by their exact email address. "
                "Returns user profile, account status (active/inactive), lock state, and role assignments. "
                "If the result contains found=false the user does not exist; do NOT say the email is invalid."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "Email address to search for"},
                },
                "required": ["email"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_get_user_details",
            "description": "Get full IAM platform details for a user including roles, teams, and status. Requires the user's internal ID from iam_search_users.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "Internal user ID (user_key or userId from iam_search_users result)",
                    },
                },
                "required": ["user_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_list_roles",
            "description": "List all roles defined in the IAM platform.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_list_communities",
            "description": "List all communities (client groups / organisations) in the IAM platform.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_list_shadow_users",
            "description": "List all shadow users (cross-client consultants) in the IAM platform.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ── Core Platform ─────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "core_search_clients",
            "description": "Search Talent Suite clients (tenants) by name. Returns a list with client IDs, names, and status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Client name or keyword (can be empty to list the first 20)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "core_get_client_products",
            "description": "Get the licensed products for a specific Talent Suite client.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {
                        "type": "string",
                        "description": "Client ID from core_search_clients result",
                    },
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "core_get_login_mode",
            "description": "Check the login mode (SSO or password) configured for a user email address or domain.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "Email address or domain"},
                },
                "required": ["email"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "core_get_sso_attributes",
            "description": "Get the SSO/SAML configuration attributes stored for a given email domain.",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Email domain (e.g. acmecorp.com) or full email address",
                    },
                },
                "required": ["domain"],
            },
        },
    },
    # ── IAM Actions ───────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "iam_send_magic_link",
            "description": (
                "Send a magic-link login email to a user. "
                "Call iam_search_users first to obtain the user's internal ID. "
                "The magic link lets the user log in without a password for 1 hour."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "User's email address"},
                    "user_id": {
                        "type": "string",
                        "description": "Internal user ID (user_key or userId from iam_search_users result)",
                    },
                    "redirect_url": {
                        "type": "string",
                        "description": "URL to redirect the user to after login (optional, defaults to platform home)",
                    },
                },
                "required": ["email", "user_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_send_otp",
            "description": (
                "Send a one-time password (OTP) to a user's email. "
                "Call iam_search_users first to obtain the user's internal ID. "
                "The OTP is 6 digits and expires in 10 minutes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "User's email address"},
                    "user_id": {
                        "type": "string",
                        "description": "Internal user ID from iam_search_users result",
                    },
                },
                "required": ["email", "user_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_lock_unlock_users",
            "description": "Lock or unlock one or more user accounts in the IAM platform.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["lock", "unlock"],
                        "description": "Whether to lock or unlock the accounts",
                    },
                    "user_keys": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of internal user keys (from iam_search_users result)",
                    },
                },
                "required": ["action", "user_keys"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_update_user_status",
            "description": "Activate or deactivate one or more user accounts in the IAM platform.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["active", "inactive"],
                        "description": "Target status for the accounts",
                    },
                    "user_keys": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of internal user keys (from iam_search_users result)",
                    },
                },
                "required": ["status", "user_keys"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_reset_password",
            "description": "Send a password reset email to a user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "User's email address"},
                },
                "required": ["email"],
            },
        },
    },
    # ── IAM Extended Reads ────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "iam_get_users_by_client",
            "description": "List users belonging to a specific Talent Suite client (tenant). Paginated.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {
                        "type": "string",
                        "description": "Client ID from core_search_clients result",
                    },
                    "page": {"type": "integer", "description": "Page number (default 1)"},
                    "limit": {"type": "integer", "description": "Page size (default 20)"},
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_get_client_groups",
            "description": "List user groups (teams) configured for a specific Talent Suite client.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {
                        "type": "string",
                        "description": "Client ID from core_search_clients result",
                    },
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "iam_get_shadow_user_clients",
            "description": "Get the list of clients (tenants) a specific shadow user has access to.",
            "parameters": {
                "type": "object",
                "properties": {
                    "shadow_user_key": {
                        "type": "string",
                        "description": "Shadow user key from iam_list_shadow_users result",
                    },
                },
                "required": ["shadow_user_key"],
            },
        },
    },
    # ── Core Platform Extended ────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "core_get_client_by_id",
            "description": "Fetch full details for a single Talent Suite client using its internal ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {
                        "type": "string",
                        "description": "Internal client ID (from core_search_clients result)",
                    },
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "core_get_active_products",
            "description": "List all active products available on the Talent Suite platform.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "core_create_sso_attributes",
            "description": (
                "Create new SSO/SAML attributes for an email domain in the Core platform. "
                "Returns a 409 error if any attribute already exists — use core_upsert_sso_attributes instead "
                "when you are not sure whether attributes exist."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Email domain (e.g. acmecorp.com)",
                    },
                    "entity_id": {"type": "string", "description": "IDP entity ID / issuer URL"},
                    "sso_url": {"type": "string", "description": "IDP single sign-on URL"},
                    "slo_url": {"type": "string", "description": "IDP single logout URL (optional)"},
                    "certificate": {"type": "string", "description": "IDP signing certificate (PEM or base64)"},
                },
                "required": ["domain", "entity_id", "sso_url", "certificate"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "core_upsert_sso_attributes",
            "description": (
                "Create or update SSO/SAML attributes for an email domain in the Core platform. "
                "Safe to call even when attributes already exist (idempotent upsert)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Email domain (e.g. acmecorp.com)",
                    },
                    "entity_id": {"type": "string", "description": "IDP entity ID / issuer URL"},
                    "sso_url": {"type": "string", "description": "IDP single sign-on URL"},
                    "slo_url": {"type": "string", "description": "IDP single logout URL (optional)"},
                    "certificate": {"type": "string", "description": "IDP signing certificate (PEM or base64)"},
                },
                "required": ["domain", "entity_id", "sso_url", "certificate"],
            },
        },
    },
    # ── IDP & Certificates ────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "idp_scan_certificates",
            "description": (
                "Scan all IDP configurations and return certificate expiry status for each. "
                "Flags certificates as 'critical' (<14 days), 'warning' (<30 days), or 'ok'."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ── Keycloak Admin ────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "keycloak_list_realms",
            "description": "List all Keycloak realms visible to the service account.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "keycloak_check_userid_mapper",
            "description": (
                "Check whether a userId claim mapper exists on a specific Keycloak client. "
                "Returns whether the mapper exists and its current configuration."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string", "description": "Keycloak realm name"},
                    "client_id": {
                        "type": "string",
                        "description": "Client ID string (not UUID) of the OIDC client",
                    },
                    "claim_name": {
                        "type": "string",
                        "description": "JWT claim name to check for (default: userId)",
                    },
                },
                "required": ["realm", "client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "keycloak_ensure_userid_mapper",
            "description": (
                "Idempotently add a userId protocol mapper to a Keycloak client's access token. "
                "Does nothing if the mapper already exists. "
                "Use keycloak_check_userid_mapper first to verify current state."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "realm": {"type": "string", "description": "Keycloak realm name"},
                    "client_id": {
                        "type": "string",
                        "description": "Client ID string (not UUID) of the OIDC client",
                    },
                    "attribute_name": {
                        "type": "string",
                        "description": "Keycloak user attribute to read (default: userId)",
                    },
                    "claim_name": {
                        "type": "string",
                        "description": "JWT claim name to emit in the access token (default: userId)",
                    },
                },
                "required": ["realm", "client_id"],
            },
        },
    },
    # ── Observability ─────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "usage_summary",
            "description": (
                "Return LLM token usage and estimated cost broken down by operation for the last 30 days, "
                "plus overall totals."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "usage_by_provider",
            "description": "Return LLM token usage and cost grouped by provider (OpenAI, Gemini) and model for the last 30 days.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

_WRITE_TOOLS = frozenset({
    "iam_lock_unlock_users",
    "iam_update_user_status",
    "iam_reset_password",
    "iam_send_magic_link",
    "iam_send_otp",
    "core_create_sso_attributes",
    "core_upsert_sso_attributes",
    "keycloak_ensure_userid_mapper",
})

# ── Datadog tool definitions ──────────────────────────────────────────────────

_DD_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "dd_search_logs",
            "description": (
                "Search Datadog logs for auth errors, login failures, or HTTP errors. "
                "Query syntax examples: 'service:login-service status:error', "
                "'@usr.email:john@example.com', '@http.status_code:401'. "
                "Use the service parameter to scope to a specific service name."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Datadog log query string (e.g. 'service:auth status:error')",
                    },
                    "time_range": {
                        "type": "string",
                        "enum": ["1h", "6h", "24h", "7d"],
                        "description": "Time window to search (default: 1h)",
                    },
                    "service": {
                        "type": "string",
                        "description": "Optional service name to prepend as 'service:<name>' filter",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dd_search_traces",
            "description": (
                "Search Datadog APM traces/spans for end-to-end request traces by user or service. "
                "Useful for understanding request paths and latency for a specific user or operation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Datadog span query string (e.g. 'service:login-service error:true')",
                    },
                    "time_range": {
                        "type": "string",
                        "enum": ["1h", "6h", "24h", "7d"],
                        "description": "Time window to search (default: 1h)",
                    },
                    "service": {
                        "type": "string",
                        "description": "Optional service name to prepend as 'service:<name>' filter",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dd_query_error_rate",
            "description": (
                "Query the error rate metric for a specific service from Datadog. "
                "Returns the recent error rate timeseries summary."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Service name to query error rate for (e.g. 'login-service')",
                    },
                    "time_range": {
                        "type": "string",
                        "enum": ["1h", "6h", "24h", "7d"],
                        "description": "Time window (default: 1h)",
                    },
                },
                "required": ["service"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dd_get_active_alerts",
            "description": (
                "List currently triggered Datadog monitors (Alert / Warn / No-Data state). "
                "Optionally filter by monitor name or service tag."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional monitor name substring to filter by",
                    },
                    "service": {
                        "type": "string",
                        "description": "Optional service name to filter monitors by tag",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dd_search_events",
            "description": (
                "Search Datadog events for deployments, incidents, or configuration changes "
                "that might have caused an issue."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Event search query (e.g. 'deploy login-service')",
                    },
                    "time_range": {
                        "type": "string",
                        "enum": ["1h", "6h", "24h", "7d"],
                        "description": "Time window (default: 24h)",
                    },
                },
                "required": ["query"],
            },
        },
    },
]

_DD_SYSTEM_PROMPT_SECTION = """
5. **Datadog** — logs, traces, metrics, monitors, and events
   Use for: auth error investigation, login failure root cause, service error rates, active alerts,
   recent deployments or incidents that correlate with user-reported issues.

**L2 Troubleshooting methodology for login issues:**
1. Check user account in IAM (iam_search_users) — is it active, unlocked?
2. Check login mode in Core (core_get_login_mode) — SSO or password?
3. Search Datadog logs for auth errors (dd_search_logs with user email or service filter)
4. Check active Datadog alerts (dd_get_active_alerts) — any ongoing incidents?
5. Correlate findings and report root cause with evidence from each source.

**Datadog query syntax guidance:**
- Filter by service: `service:my-service`
- Filter by user email: `@usr.email:john@example.com`
- Filter by HTTP status: `@http.status_code:401`
- Filter by error: `status:error` or `error:true` (for traces)
- Combine filters: `service:login-service @http.status_code:401`
"""


# ── Gemini schema helpers ─────────────────────────────────────────────────────

def _convert_schema_types(schema: dict) -> dict:
    """Recursively convert OpenAI JSON Schema type names to Gemini's uppercase format."""
    if not isinstance(schema, dict):
        return schema
    type_map = {
        "string": "STRING", "number": "NUMBER", "integer": "INTEGER",
        "boolean": "BOOLEAN", "array": "ARRAY", "object": "OBJECT",
    }
    result = {}
    for k, v in schema.items():
        if k == "type" and isinstance(v, str):
            result[k] = type_map.get(v, v.upper())
        elif isinstance(v, dict):
            result[k] = _convert_schema_types(v)
        elif isinstance(v, list):
            result[k] = [_convert_schema_types(i) if isinstance(i, dict) else i for i in v]
        else:
            result[k] = v
    return result


def _openai_to_gemini_tools(openai_tools: list) -> list:
    """Convert OpenAI tool definitions to Gemini function_declarations format."""
    declarations = []
    for t in openai_tools:
        fn = t["function"]
        decl: dict = {"name": fn["name"], "description": fn["description"]}
        if fn.get("parameters"):
            decl["parameters"] = _convert_schema_types(fn["parameters"])
        declarations.append(decl)
    return [{"function_declarations": declarations}]


# ── Engine ────────────────────────────────────────────────────────────────────

class UnifiedChatEngine:
    """
    Answers questions about Keycloak, the IAM platform, and the Core platform
    using LLM function-calling. Runs an agentic loop (up to 5 tool-call rounds).
    """

    def __init__(self, kc_admin: KeycloakAdminClient):
        self.kc = kc_admin

    async def chat(
        self,
        message: str,
        history: list[dict],        # [{"role": "user"|"assistant", "content": "..."}]
        realm: str,
        token: Optional[str],
        provider: str = "openai",
        user_roles: Optional[list] = None,
    ) -> dict:
        """
        Returns:
            {
                "reply":       str,          # markdown-formatted answer
                "sources":     list[str],    # tool names called
                "token_usage": dict,         # {prompt_tokens, completion_tokens, total_tokens}
            }
        """
        tools = _TOOLS + (_DD_TOOLS if dd_available() else [])
        system_prompt = SYSTEM_PROMPT + (_DD_SYSTEM_PROMPT_SECTION if dd_available() else "")

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-20:])   # up to last 10 turns for context
        messages.append({"role": "user", "content": message})

        if provider == "gemini":
            return await self._gemini_loop(messages, realm, token, tools, system_prompt, user_roles)
        return await self._openai_loop(messages, realm, token, tools, user_roles)

    # ── OpenAI agentic loop ───────────────────────────────────────────────────

    async def _openai_loop(
        self, messages: list, realm: str, token: Optional[str], tools: list, user_roles: Optional[list] = None
    ) -> dict:
        sources: list[str] = []
        total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        start = time.time()
        prompt_tokens = completion_tokens = 0
        success = False

        try:
            for _round in range(5):
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        "https://api.openai.com/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {OPENAI_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "gpt-4o",
                            "messages": messages,
                            "tools": tools,
                            "tool_choice": "auto",
                            "temperature": 0.2,
                            "max_tokens": 2000,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()

                usage = data.get("usage", {})
                pt = usage.get("prompt_tokens", 0)
                ct = usage.get("completion_tokens", 0)
                prompt_tokens     += pt
                completion_tokens += ct
                total_usage["prompt_tokens"]     += pt
                total_usage["completion_tokens"] += ct
                total_usage["total_tokens"]      += pt + ct

                choice = data["choices"][0]
                msg    = choice["message"]

                if not msg.get("tool_calls"):
                    success = True
                    return {
                        "reply": msg.get("content") or "",
                        "sources": sources,
                        "token_usage": total_usage,
                    }

                # Append the assistant message with its tool_calls
                messages.append(msg)

                for tc in msg["tool_calls"]:
                    fn_name = tc["function"]["name"]
                    fn_args = json.loads(tc["function"]["arguments"] or "{}")
                    sources.append(fn_name)
                    result = await self._execute_tool(fn_name, fn_args, realm, token, user_roles)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": json.dumps(result, default=str),
                    })

            # Exhausted rounds — return whatever the last text was
            success = True
            last_text = next(
                (m.get("content") for m in reversed(messages)
                 if m.get("role") == "assistant" and m.get("content")),
                "I gathered data from multiple services but could not synthesise a final answer. Please try a more specific question.",
            )
            return {"reply": last_text, "sources": sources, "token_usage": total_usage}

        finally:
            log_llm_usage(
                "unified_chat", "openai", "gpt-4o",
                prompt_tokens, completion_tokens,
                int((time.time() - start) * 1000), success,
            )

    # ── Gemini agentic loop ───────────────────────────────────────────────────

    async def _gemini_loop(
        self, messages: list, realm: str, token: Optional[str], tools: list, system_prompt: str, user_roles: Optional[list] = None
    ) -> dict:
        sources: list[str] = []
        total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        start = time.time()
        prompt_tokens = completion_tokens = 0
        success = False

        # Split off the system message; convert the rest to Gemini format
        system_text = system_prompt
        gemini_contents: list = []
        for m in messages:
            if m["role"] == "system":
                continue
            role = "user" if m["role"] == "user" else "model"
            content = m.get("content") or ""
            gemini_contents.append({"role": role, "parts": [{"text": content}]})

        gemini_tools = _openai_to_gemini_tools(tools)

        try:
            for _round in range(5):
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/"
                        f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}",
                        json={
                            "system_instruction": {"parts": [{"text": system_text}]},
                            "contents": gemini_contents,
                            "tools": gemini_tools,
                            "tool_config": {"function_calling_config": {"mode": "AUTO"}},
                            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2000},
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()

                meta = data.get("usageMetadata", {})
                pt = meta.get("promptTokenCount", 0)
                ct = meta.get("candidatesTokenCount", 0)
                prompt_tokens     += pt
                completion_tokens += ct
                total_usage["prompt_tokens"]     += pt
                total_usage["completion_tokens"] += ct
                total_usage["total_tokens"]      += pt + ct

                candidate = data["candidates"][0]
                parts     = candidate["content"]["parts"]

                fn_calls   = [p["functionCall"] for p in parts if "functionCall" in p]
                text_parts = [p["text"] for p in parts if "text" in p]

                if not fn_calls:
                    success = True
                    return {
                        "reply": "\n".join(text_parts),
                        "sources": sources,
                        "token_usage": total_usage,
                    }

                # Append the model's function-call message
                gemini_contents.append({"role": "model", "parts": parts})

                # Execute and collect function responses as one user turn
                fn_responses = []
                for fn_call in fn_calls:
                    fn_name = fn_call["name"]
                    fn_args = fn_call.get("args", {})
                    sources.append(fn_name)
                    result = await self._execute_tool(fn_name, fn_args, realm, token, user_roles)
                    fn_responses.append({
                        "functionResponse": {
                            "name": fn_name,
                            "response": {"content": json.dumps(result, default=str)},
                        }
                    })
                gemini_contents.append({"role": "user", "parts": fn_responses})

            # Exhausted rounds
            success = True
            return {
                "reply": "I gathered data from multiple services but could not synthesise a final answer. Please try a more specific question.",
                "sources": sources,
                "token_usage": total_usage,
            }

        finally:
            log_llm_usage(
                "unified_chat", "gemini", "gemini-2.0-flash",
                prompt_tokens, completion_tokens,
                int((time.time() - start) * 1000), success,
            )

    # ── Tool execution ────────────────────────────────────────────────────────

    async def _execute_tool(
        self, name: str, args: dict, realm: str, token: Optional[str], user_roles: Optional[list] = None
    ):
        """Dispatch a tool call. Returns a JSON-serialisable result or an error dict."""
        try:
            if name in _WRITE_TOOLS and "agent-admin" not in (user_roles or []):
                return {"error": "You need admin privileges to perform this action", "tool": name, "blocked": True}
            # ── Keycloak ──────────────────────────────────────────────────────
            if name == "keycloak_list_roles":
                return await self.kc.get_realm_roles(args.get("realm", realm))

            if name == "keycloak_list_clients":
                return await self.kc.get_clients(args.get("realm", realm))

            if name == "keycloak_get_user":
                r        = args.get("realm", realm)
                username = args.get("username_or_email", "")
                users    = await self.kc.search_users(r, username)
                if not users:
                    return {"found": False, "search": username}
                u      = users[0]
                roles  = await self.kc.get_user_roles(r, u["id"])
                groups = await self.kc.get_user_groups(r, u["id"])
                return {"user": u, "roles": roles, "groups": groups}

            if name == "keycloak_list_groups":
                return await self.kc.get_groups(args.get("realm", realm))

            if name == "keycloak_get_client_authorization":
                return await self.kc.get_client_authorization(
                    args.get("realm", realm), args.get("client_uuid", "")
                )

            if name == "keycloak_get_role_members":
                return await self.kc.get_role_users(
                    args.get("realm", realm), args.get("role_name", "")
                )

            # ── IAM Platform ──────────────────────────────────────────────────
            if name == "iam_search_users":
                email = args.get("email", "")
                # Prefer /v2/users/details?emailId= (direct lookup by email).
                # Fall back to /v2/users/search if the details endpoint is absent.
                try:
                    return await get_user_by_email(email, token or "")
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 404:
                        # Endpoint exists but user not found — propagate as-is
                        return {"found": False, "email": email}
                    # Endpoint returned another error — fall back to search
                    pass
                return await search_users(email, token or "")

            if name == "iam_get_user_details":
                return await get_user_details(args.get("user_id", ""), token or "")

            if name == "iam_list_roles":
                return await get_roles(token or "")

            if name == "iam_list_communities":
                return await get_communities(token or "")

            if name == "iam_list_shadow_users":
                return await get_shadow_users(token or "")

            # ── Core Platform ─────────────────────────────────────────────────
            if name == "core_search_clients":
                return await get_clients(token or "", search=args.get("search", ""), page=1, limit=20)

            if name == "core_get_client_products":
                return await get_client_products(token or "", client_key=args.get("client_id", ""))

            if name == "core_get_login_mode":
                return await get_client_login_mode(args.get("email", ""), token or "")

            if name == "core_get_sso_attributes":
                domain = args.get("domain", "")
                if "@" in domain:
                    domain = domain.split("@")[-1]
                result = await core_get_domain_attributes(domain, token)
                return result if result is not None else {"found": False, "domain": domain}

            # ── IAM Actions ───────────────────────────────────────────────────
            if name == "iam_send_magic_link":
                return await send_magic_link(
                    args.get("email", ""),
                    args.get("user_id", ""),
                    args.get("redirect_url", ""),
                    token or "",
                )

            if name == "iam_send_otp":
                return await send_otp(
                    args.get("email", ""),
                    args.get("user_id", ""),
                    token or "",
                )

            if name == "iam_lock_unlock_users":
                return await lock_unlock_users(
                    args.get("action", "lock"),
                    args.get("user_keys", []),
                    token or "",
                )

            if name == "iam_update_user_status":
                return await update_user_status(
                    args.get("status", "active"),
                    args.get("user_keys", []),
                    token or "",
                )

            if name == "iam_reset_password":
                return await reset_user_password(args.get("email", ""), token or "")

            # ── IAM Extended Reads ────────────────────────────────────────────
            if name == "iam_get_users_by_client":
                return await get_users_by_client(
                    args.get("client_id", ""),
                    token or "",
                    page=args.get("page", 1),
                    limit=args.get("limit", 20),
                )

            if name == "iam_get_client_groups":
                return await get_user_groups_by_client(
                    args.get("client_id", ""),
                    token or "",
                )

            if name == "iam_get_shadow_user_clients":
                return await get_shadow_user_clients(
                    args.get("shadow_user_key", ""),
                    token or "",
                )

            # ── Core Platform Extended ─────────────────────────────────────────
            if name == "core_get_client_by_id":
                return await get_client_by_id(args.get("client_id", ""), token or "")

            if name == "core_get_active_products":
                return await get_active_products(token or "")

            if name == "core_create_sso_attributes":
                domain = args.get("domain", "")
                config = {
                    "entity_id": args.get("entity_id"),
                    "sso_url":   args.get("sso_url"),
                    "slo_url":   args.get("slo_url"),
                    "certificate": args.get("certificate"),
                }
                return await core_create_domain_attributes(domain, config, token)

            if name == "core_upsert_sso_attributes":
                domain = args.get("domain", "")
                config = {
                    "entity_id": args.get("entity_id"),
                    "sso_url":   args.get("sso_url"),
                    "slo_url":   args.get("slo_url"),
                    "certificate": args.get("certificate"),
                }
                return await core_upsert_domain_attributes(domain, config, token)

            # ── IDP & Certificates ────────────────────────────────────────────
            if name == "idp_scan_certificates":
                return scan_all_certificates()

            # ── Keycloak Admin ────────────────────────────────────────────────
            if name == "keycloak_list_realms":
                return await self.kc.get_realms()

            if name == "keycloak_check_userid_mapper":
                return await self.kc.check_user_id_mapper(
                    args.get("realm", realm),
                    args.get("client_id", ""),
                    args.get("claim_name", "userId"),
                )

            if name == "keycloak_ensure_userid_mapper":
                return await self.kc.ensure_user_id_mapper(
                    args.get("realm", realm),
                    args.get("client_id", ""),
                    attribute_name=args.get("attribute_name", "userId"),
                    claim_name=args.get("claim_name", "userId"),
                )

            # ── Observability ─────────────────────────────────────────────────
            if name == "usage_summary":
                return get_usage_summary()

            if name == "usage_by_provider":
                return get_usage_by_provider()

            # ── Datadog ───────────────────────────────────────────────────────
            if name == "dd_search_logs":
                time_range = args.get("time_range", "1h")
                from_ts, to_ts = _parse_time_range(time_range)
                query = args.get("query", "")
                service = args.get("service")
                if service:
                    query = f"service:{service} {query}".strip()
                return await dd_search_logs(query, from_ts, to_ts)

            if name == "dd_search_traces":
                time_range = args.get("time_range", "1h")
                from_ts, to_ts = _parse_time_range(time_range)
                query = args.get("query", "")
                service = args.get("service")
                if service:
                    query = f"service:{service} {query}".strip()
                return await dd_search_traces(query, from_ts, to_ts)

            if name == "dd_query_error_rate":
                time_range = args.get("time_range", "1h")
                from_ts, to_ts = _parse_time_range(time_range)
                # Convert ISO 8601 timestamps to Unix epoch integers for the metrics API
                from datetime import datetime as _dt
                from_epoch = int(_dt.fromisoformat(from_ts.replace("Z", "+00:00")).timestamp())
                to_epoch   = int(_dt.fromisoformat(to_ts.replace("Z", "+00:00")).timestamp())
                service = args.get("service", "")
                metric_query = f"sum:trace.web.request.errors{{service:{service}}}.as_count()"
                return await dd_query_metrics(metric_query, from_epoch, to_epoch)

            if name == "dd_get_active_alerts":
                query   = args.get("query", "")
                service = args.get("service")
                tags    = [f"service:{service}"] if service else None
                return await dd_get_active_monitors(query=query, tags=tags)

            if name == "dd_search_events":
                time_range = args.get("time_range", "24h")
                from_ts, to_ts = _parse_time_range(time_range)
                return await dd_search_events(args.get("query", ""), from_ts, to_ts)

            return {"error": f"Unknown tool: {name}"}

        except httpx.HTTPStatusError as exc:
            return {"error": f"HTTP {exc.response.status_code}", "detail": exc.response.text[:300]}
        except httpx.RequestError as exc:
            return {"error": "Service unreachable", "detail": str(exc)}
        except Exception as exc:
            return {"error": str(exc)}
