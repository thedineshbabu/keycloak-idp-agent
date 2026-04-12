"""
Platform API Client
Proxy functions for Talent Suite Core and IAM service REST APIs.
All calls forward the user's Keycloak bearer token.
"""
import os
from typing import Optional

import httpx

CORE_API_BASE_URL     = os.getenv("CORE_API_BASE_URL", "")
IAM_API_BASE_URL      = os.getenv("IAM_API_BASE_URL", "")
CORE_API_BEARER_TOKEN = os.getenv("CORE_API_BEARER_TOKEN", "")

_OPTS = dict(timeout=httpx.Timeout(20.0), verify=False)


def _require_core_url():
    if not CORE_API_BASE_URL:
        raise httpx.RequestError("CORE_API_BASE_URL is not configured — set it in .env")


def _require_iam_url():
    if not IAM_API_BASE_URL:
        raise httpx.RequestError("IAM_API_BASE_URL is not configured — set it in .env")


def _hdrs(token: Optional[str] = None) -> dict:
    """Build Authorization headers, forwarding the caller's access token."""
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    return hdrs


# ── Core API: Clients ─────────────────────────────────────────────────────────

async def get_clients(token: str, search: str = "", page: int = 1, limit: int = 20) -> dict:
    """GET /v2/clients — paginated list, optional name search."""
    _require_core_url()
    params: dict = {"pageNumber": page, "pageSize": limit}
    if search:
        params["searchKey"] = search
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{CORE_API_BASE_URL}/v2/clients", params=params, headers=_hdrs(token))
        r.raise_for_status()
        return r.json()


async def get_client_by_id(client_id: str, token: str) -> dict:
    """GET /v2/clients/by-id/{id}"""
    _require_core_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{CORE_API_BASE_URL}/v2/clients/by-id/{client_id}", headers=_hdrs(token))
        r.raise_for_status()
        return r.json()


async def get_client_products(token: str, client_key: str = "") -> list:
    """GET /v2/products?clientKey=..."""
    _require_core_url()
    params = {"clientKey": client_key} if client_key else {}
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{CORE_API_BASE_URL}/v2/products", params=params, headers=_hdrs(token))
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


async def get_client_login_mode(email: str, token: str) -> dict:
    """GET /v2/clients/login-mode?email=..."""
    _require_core_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(
            f"{CORE_API_BASE_URL}/v2/clients/login-mode",
            params={"email": email},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json()


async def get_active_products(token: str) -> list:
    """GET /v2/products/getActiveProducts"""
    _require_core_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{CORE_API_BASE_URL}/v2/products/getActiveProducts", headers=_hdrs(token))
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


# ── IAM API: Users ────────────────────────────────────────────────────────────

async def search_users(email: str, token: str, pams_id: str = "") -> dict:
    """GET /v2/users/search?email=..."""
    _require_iam_url()
    params: dict = {"email": email}
    if pams_id:
        params["pamsId"] = pams_id
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{IAM_API_BASE_URL}/v2/users/search", params=params, headers=_hdrs(token))
        r.raise_for_status()
        return r.json()


async def get_user_by_email(email: str, token: str) -> dict:
    """GET /v2/users/details?emailId={email} — direct email lookup (more reliable than search)."""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(
            f"{IAM_API_BASE_URL}/v2/users/details",
            params={"emailId": email},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json()


async def get_user_details(user_id: str, token: str) -> dict:
    """GET /v2/users/{id}/details"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{IAM_API_BASE_URL}/v2/users/{user_id}/details", headers=_hdrs(token))
        r.raise_for_status()
        return r.json()


async def get_users_by_client(client_id: str, token: str, page: int = 1, limit: int = 20) -> dict:
    """GET /v2/users/by-clientid/{clientId}"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(
            f"{IAM_API_BASE_URL}/v2/users/by-clientid/{client_id}",
            params={"pageNumber": page, "pageSize": limit},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json()


async def lock_unlock_users(action: str, user_keys: list, token: str) -> dict:
    """PATCH /v2/users/lock  action: 'lock' | 'unlock'"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.patch(
            f"{IAM_API_BASE_URL}/v2/users/lock",
            json={"action": action, "users": user_keys},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json() if r.content else {"success": True}


async def update_user_status(status: str, user_keys: list, token: str) -> dict:
    """PATCH /v2/users/status  status: 'active' | 'inactive'"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.patch(
            f"{IAM_API_BASE_URL}/v2/users/status",
            json={"status": status, "users": user_keys},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json() if r.content else {"success": True}


async def reset_user_password(email: str, token: str) -> dict:
    """POST /v2/users/reset-password"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.post(
            f"{IAM_API_BASE_URL}/v2/users/reset-password",
            json={"email": email},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json() if r.content else {"success": True}


async def send_magic_link(email: str, user_id: str, redirect_url: str, token: str) -> dict:
    """POST /v1/event/send-magic-link"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.post(
            f"{IAM_API_BASE_URL}/v1/event/send-magic-link",
            json={
                "email": email,
                "userId": user_id,
                "redirectUrl": redirect_url,
                "expiresIn": 3600,
            },
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json() if r.content else {"success": True}


async def send_otp(email: str, user_id: str, token: str) -> dict:
    """POST /v1/event/send-otp"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.post(
            f"{IAM_API_BASE_URL}/v1/event/send-otp",
            json={"email": email, "userId": user_id, "otpLength": 6, "expiresIn": 600},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json() if r.content else {"success": True}


# ── IAM API: Roles ────────────────────────────────────────────────────────────

async def get_roles(token: str) -> list:
    """GET /v2/roles"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{IAM_API_BASE_URL}/v2/roles", headers=_hdrs(token))
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


# ── IAM API: Shadow Users ─────────────────────────────────────────────────────

async def get_shadow_users(token: str) -> list:
    """GET /v3/shadow-users"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{IAM_API_BASE_URL}/v3/shadow-users", headers=_hdrs(token))
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


async def get_shadow_user_clients(shadow_user_key: str, token: str) -> dict:
    """GET /v3/shadow-users/{shadow_user_key}/clients"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(
            f"{IAM_API_BASE_URL}/v3/shadow-users/{shadow_user_key}/clients",
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json()


# ── IAM API: Communities ──────────────────────────────────────────────────────

async def get_communities(token: str) -> list:
    """GET /v3/communities"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(f"{IAM_API_BASE_URL}/v3/communities", headers=_hdrs(token))
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])


# ── IAM API: User Groups ──────────────────────────────────────────────────────

async def get_user_groups_by_client(client_id: str, token: str, page: int = 1, limit: int = 50) -> dict:
    """GET /v2/userGroups/by-clientid/{clientId}"""
    _require_iam_url()
    async with httpx.AsyncClient(**_OPTS) as c:
        r = await c.get(
            f"{IAM_API_BASE_URL}/v2/userGroups/by-clientid/{client_id}",
            params={"pageNumber": page, "pageSize": limit},
            headers=_hdrs(token),
        )
        r.raise_for_status()
        return r.json()
