"""
Keycloak Admin API Client
Fetches realm roles, clients, authorization policies, users, and groups
using service account credentials (client_credentials grant).
"""
import os
import time
from typing import Optional

import httpx

KEYCLOAK_URL             = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
KEYCLOAK_ADMIN_CLIENT_ID = os.getenv("KEYCLOAK_ADMIN_CLIENT_ID", "")
KEYCLOAK_ADMIN_CLIENT_SECRET = os.getenv("KEYCLOAK_ADMIN_CLIENT_SECRET", "")

# Simple in-process token cache: {realm -> (access_token, expires_at)}
_token_cache: dict[str, tuple[str, float]] = {}


class KeycloakAdminClient:

    # ── Auth ──────────────────────────────────────────────────────────────────

    async def _get_token(self, realm: str) -> str:
        """Return a cached service-account access token, refreshing when needed."""
        cached = _token_cache.get(realm)
        if cached and time.time() < cached[1] - 30:
            return cached[0]

        url = f"{KEYCLOAK_URL}/realms/{realm}/protocol/openid-connect/token"
        async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
            r = await client.post(url, data={
                "grant_type":    "client_credentials",
                "client_id":     KEYCLOAK_ADMIN_CLIENT_ID,
                "client_secret": KEYCLOAK_ADMIN_CLIENT_SECRET,
            })
            r.raise_for_status()
            data = r.json()

        token = data["access_token"]
        expires_at = time.time() + data.get("expires_in", 300)
        _token_cache[realm] = (token, expires_at)
        return token

    async def _get(self, realm: str, path: str, params: Optional[dict] = None) -> any:
        """Authenticated GET against the Keycloak Admin REST API."""
        token = await self._get_token(realm)
        url = f"{KEYCLOAK_URL}/admin/realms/{realm}{path}"
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            r = await client.get(
                url,
                params=params or {},
                headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            return r.json()

    # ── Realm helpers ─────────────────────────────────────────────────────────

    async def get_realms(self) -> list[dict]:
        """List all realms visible to the service account (master realm only)."""
        token = await self._get_token("master")
        url = f"{KEYCLOAK_URL}/admin/realms"
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            r = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            r.raise_for_status()
            realms = r.json()
        return [{"id": rl.get("id"), "realm": rl.get("realm"),
                 "displayName": rl.get("displayName", rl.get("realm")),
                 "enabled": rl.get("enabled", True)} for rl in realms]

    # ── Realm roles ───────────────────────────────────────────────────────────

    async def get_realm_roles(self, realm: str) -> list[dict]:
        """All realm-level roles."""
        return await self._get(realm, "/roles")

    async def get_role_composites(self, realm: str, role_name: str) -> list[dict]:
        """Composite (child) roles for a given realm role."""
        return await self._get(realm, f"/roles/{role_name}/composites")

    async def get_role_users(self, realm: str, role_name: str) -> list[dict]:
        """Users assigned to a realm role (max 100)."""
        return await self._get(realm, f"/roles/{role_name}/users", {"max": 100})

    # ── Clients ───────────────────────────────────────────────────────────────

    async def get_clients(self, realm: str) -> list[dict]:
        """All clients in the realm."""
        clients = await self._get(realm, "/clients")
        # Return a trimmed set of fields to keep the context payload small
        return [
            {
                "id":                    c.get("id"),
                "clientId":              c.get("clientId"),
                "name":                  c.get("name", ""),
                "description":           c.get("description", ""),
                "enabled":               c.get("enabled", True),
                "protocol":              c.get("protocol"),
                "publicClient":          c.get("publicClient", False),
                "authorizationServicesEnabled": c.get("authorizationServicesEnabled", False),
                "redirectUris":          c.get("redirectUris", []),
                "webOrigins":            c.get("webOrigins", []),
                "serviceAccountsEnabled": c.get("serviceAccountsEnabled", False),
            }
            for c in clients
        ]

    async def get_client_roles(self, realm: str, client_id: str) -> list[dict]:
        """Client-level roles for a given client UUID."""
        return await self._get(realm, f"/clients/{client_id}/roles")

    async def get_client_authorization(self, realm: str, client_id: str) -> dict:
        """Authorization resources, policies, permissions, and scopes for a client."""
        resources   = await self._get(realm, f"/clients/{client_id}/authz/resource-server/resource")
        policies    = await self._get(realm, f"/clients/{client_id}/authz/resource-server/policy")
        permissions = await self._get(realm, f"/clients/{client_id}/authz/resource-server/permission")
        scopes      = await self._get(realm, f"/clients/{client_id}/authz/resource-server/scope")
        return {
            "resources":   resources,
            "policies":    policies,
            "permissions": permissions,
            "scopes":      scopes,
        }

    # ── Users ─────────────────────────────────────────────────────────────────

    async def search_users(self, realm: str, search: str) -> list[dict]:
        """Search users by username, email, first name, or last name."""
        return await self._get(realm, "/users", {"search": search, "max": 20})

    async def get_user_roles(self, realm: str, user_id: str) -> dict:
        """Effective realm roles and client roles for a user."""
        realm_roles = await self._get(realm, f"/users/{user_id}/role-mappings/realm")
        # Also try to get composite (effective) roles
        try:
            effective = await self._get(realm, f"/users/{user_id}/role-mappings/realm/composite")
        except Exception:
            effective = []
        clients = await self.get_clients(realm)
        client_roles: dict[str, list] = {}
        for c in clients:
            try:
                roles = await self._get(realm, f"/users/{user_id}/role-mappings/clients/{c['id']}")
                if roles:
                    client_roles[c["clientId"]] = roles
            except Exception:
                pass
        return {
            "realm_roles":     realm_roles,
            "effective_roles": effective,
            "client_roles":    client_roles,
        }

    async def get_user_groups(self, realm: str, user_id: str) -> list[dict]:
        """Groups a user belongs to."""
        return await self._get(realm, f"/users/{user_id}/groups")

    # ── Groups ────────────────────────────────────────────────────────────────

    async def get_groups(self, realm: str) -> list[dict]:
        """Top-level groups in the realm."""
        return await self._get(realm, "/groups")

    # ── Smart context builder ─────────────────────────────────────────────────

    async def build_context(self, realm: str, query: str) -> dict:
        """
        Fetch only the Keycloak data relevant to the question.
        Always fetches: realm roles, clients.
        Conditionally fetches based on keywords in the question.
        """
        q = query.lower()
        context: dict = {}
        errors: list[str] = []

        # Always fetch baseline data
        try:
            context["realm_roles"] = await self.get_realm_roles(realm)
        except Exception as e:
            errors.append(f"realm_roles: {e}")
            context["realm_roles"] = []

        try:
            raw_clients = await self.get_clients(realm)
            context["clients"] = raw_clients
        except Exception as e:
            errors.append(f"clients: {e}")
            raw_clients = []
            context["clients"] = []

        # User / email queries
        user_keywords = ("user", "email", "who", "member", "assigned", "belong")
        if any(kw in q for kw in user_keywords):
            # Extract a potential search term — grab the last word that looks like
            # an email or a username (heuristic)
            words = [w.strip("?,.'\"") for w in query.split()]
            search_term = next(
                (w for w in reversed(words) if "@" in w or (len(w) > 3 and w.isalpha())),
                "",
            )
            if search_term:
                try:
                    users = await self.search_users(realm, search_term)
                    context["users"] = users
                    if users:
                        uid = users[0]["id"]
                        context["user_roles"]  = await self.get_user_roles(realm, uid)
                        context["user_groups"] = await self.get_user_groups(realm, uid)
                except Exception as e:
                    errors.append(f"users: {e}")

        # Policy / permission / authorization queries
        authz_keywords = ("policy", "permission", "access", "resource", "scope", "allow", "deny", "block")
        if any(kw in q for kw in authz_keywords):
            for client in raw_clients:
                if client.get("authorizationServicesEnabled"):
                    try:
                        authz = await self.get_client_authorization(realm, client["id"])
                        context[f"authz_{client['clientId']}"] = authz
                    except Exception as e:
                        errors.append(f"authz_{client['clientId']}: {e}")

        # Role composite / hierarchy queries
        role_keywords = ("composite", "inherit", "include", "hierarch", "child", "parent")
        if any(kw in q for kw in role_keywords):
            for role in context.get("realm_roles", []):
                if role.get("composite"):
                    try:
                        composites = await self.get_role_composites(realm, role["name"])
                        context.setdefault("role_composites", {})[role["name"]] = composites
                    except Exception as e:
                        errors.append(f"composites_{role['name']}: {e}")

        # Role membership queries
        if any(kw in q for kw in ("who", "user", "member", "assigned")):
            role_in_query = _extract_role_name(q, context.get("realm_roles", []))
            if role_in_query:
                try:
                    context["role_users"] = {
                        role_in_query: await self.get_role_users(realm, role_in_query)
                    }
                except Exception as e:
                    errors.append(f"role_users: {e}")

        # Group queries
        if any(kw in q for kw in ("group", "team", "org")):
            try:
                context["groups"] = await self.get_groups(realm)
            except Exception as e:
                errors.append(f"groups: {e}")

        if errors:
            context["_fetch_errors"] = errors

        return context


def _extract_role_name(query: str, roles: list[dict]) -> Optional[str]:
    """Return the first role name found verbatim inside the query string."""
    for role in roles:
        name = role.get("name", "")
        if name and name.lower() in query:
            return name
    return None
