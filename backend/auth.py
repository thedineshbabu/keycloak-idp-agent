"""
Keycloak JWT Validation (Item 2: SSO Login)

Set KEYCLOAK_ENABLED=true plus KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID
to activate token enforcement. When disabled, every request gets a default
admin context so local development works without a Keycloak instance.
"""
import os
import time

import httpx
from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt

KEYCLOAK_ENABLED   = os.getenv("KEYCLOAK_ENABLED", "true").lower() == "true"
KEYCLOAK_URL       = os.getenv("KEYCLOAK_URL", "https://your-keycloak-server")
KEYCLOAK_REALM     = os.getenv("KEYCLOAK_REALM", "your-realm")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "your-client-id")

_CERTS_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"

# JWKS cache — refreshed at most once every 15 minutes
_JWKS_TTL   = 900          # seconds
_jwks_cache = {"keys": None, "fetched_at": 0.0}


async def _get_jwks() -> dict:
    """
    Return Keycloak's public JWKS, using a 15-minute in-memory cache.
    On a fetch failure, returns the last known-good keys if available so
    that a temporary Keycloak outage does not lock out every request.
    Raises HTTPException(503) only when the cache is empty and the fetch fails.
    """
    now = time.monotonic()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL:
        return _jwks_cache["keys"]

    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.get(_CERTS_URL)
            resp.raise_for_status()
            jwks = resp.json()
        _jwks_cache["keys"] = jwks
        _jwks_cache["fetched_at"] = now
        return jwks
    except Exception as exc:
        if _jwks_cache["keys"]:
            # Keycloak temporarily unreachable — serve from stale cache
            return _jwks_cache["keys"]
        raise HTTPException(
            status_code=503,
            detail=f"Cannot reach Keycloak for key fetch: {exc}",
        )


async def verify_token(authorization: str = Header(default=None)) -> dict:
    """
    FastAPI dependency.  Returns a user context dict:
        {"sub": "...", "email": "...", "name": "...", "roles": [...]}

    When KEYCLOAK_ENABLED is false, returns a synthetic admin context so the
    app runs normally in local development.
    """
    if not KEYCLOAK_ENABLED:
        # Still extract the raw bearer token if the frontend sends one, so it
        # can be forwarded to downstream APIs (Core, IAM) without validation.
        raw_token = None
        if authorization and authorization.startswith("Bearer "):
            raw_token = authorization[7:]
        return {
            "sub": "local-dev",
            "email": "admin@localhost",
            "name": "Local Admin",
            "roles": ["agent-admin"],
            "access_token": raw_token,
        }

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization: Bearer <token> header required")

    token = authorization[7:]
    jwks  = await _get_jwks()

    try:
        # Decode without audience enforcement — Keycloak access tokens often carry
        # aud=["account"] or the realm URL rather than the client ID, so a strict
        # audience check causes false rejections.  Signature verification against
        # the Keycloak JWKS is the real security boundary here.
        payload = jwt.decode(
            token, jwks, algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {exc}")

    # Still enforce the issuer so tokens from other realms are rejected
    expected_issuer = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"
    if payload.get("iss") != expected_issuer:
        raise HTTPException(status_code=401, detail="Token issuer does not match configured Keycloak realm")

    realm_roles    = payload.get("realm_access", {}).get("roles", [])
    resource_roles = payload.get("resource_access", {}).get(KEYCLOAK_CLIENT_ID, {}).get("roles", [])

    return {
        "sub":          payload.get("sub"),
        "email":        payload.get("email"),
        "name":         payload.get("name"),
        "roles":        realm_roles + resource_roles,
        "access_token": token,
    }


def require_admin(user: dict = Depends(verify_token)) -> dict:
    """Use as a FastAPI dependency to restrict an endpoint to agent-admin role."""
    if "agent-admin" not in user.get("roles", []):
        raise HTTPException(status_code=403, detail="You need admin privileges to perform this action")
    return user
