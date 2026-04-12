"""
Keycloak Admin API Client
Fetches realm roles, clients, authorization policies, users, and groups
using service account credentials (client_credentials grant).
"""
import os
import re
import time
from typing import Optional

import httpx

KEYCLOAK_URL             = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
KEYCLOAK_REALM           = os.getenv("KEYCLOAK_REALM", "master")
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

    async def _post(self, realm: str, path: str, body: dict) -> httpx.Response:
        """Authenticated POST against the Keycloak Admin REST API. Returns the raw response."""
        token = await self._get_token(realm)
        url = f"{KEYCLOAK_URL}/admin/realms/{realm}{path}"
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            r = await client.post(
                url,
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            r.raise_for_status()
            return r

    # ── Realm helpers ─────────────────────────────────────────────────────────

    async def get_realms(self) -> list[dict]:
        """
        List realms visible to the service account.
        Tries /admin/realms (requires master-realm cross-realm rights); if that
        returns 403, falls back to returning just the configured realm so the
        Policy Assistant still works with single-realm service accounts.
        """
        token = await self._get_token(KEYCLOAK_REALM)
        url = f"{KEYCLOAK_URL}/admin/realms"
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            r = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if r.status_code == 403:
                # Service account can only see its own realm — return it directly
                return [{"id": KEYCLOAK_REALM, "realm": KEYCLOAK_REALM,
                         "displayName": KEYCLOAK_REALM, "enabled": True}]
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

    async def get_users(self, realm: str, max: int = 100) -> list[dict]:
        """List up to *max* users in the realm with no filter."""
        return await self._get(realm, "/users", {"max": max, "briefRepresentation": "false"})

    async def get_user_count(self, realm: str) -> int:
        """Return the total number of users in the realm via the dedicated count endpoint."""
        result = await self._get(realm, "/users/count")
        # Keycloak returns a plain integer for this endpoint
        return int(result) if isinstance(result, (int, float, str)) else 0

    async def get_user_with_details(self, realm: str, user: dict) -> dict:
        """Augment a user dict with their roles and groups embedded.

        Returns a flat dict the LLM can reason about directly::

            {
                "id": "...", "username": "...", "email": "...",
                "enabled": true,
                "realm_roles": ["admin", "viewer"],
                "client_roles": {"my-app": ["editor"]},
                "groups": ["team-a", "org-b"]
            }
        """
        uid = user["id"]
        result = {
            k: user.get(k)
            for k in ("id", "username", "email", "firstName", "lastName", "enabled", "emailVerified")
            if user.get(k) is not None
        }
        try:
            roles = await self.get_user_roles(realm, uid)
            result["realm_roles"]    = [r["name"] for r in roles.get("realm_roles", [])]
            result["client_roles"]   = {
                client: [r["name"] for r in role_list]
                for client, role_list in roles.get("client_roles", {}).items()
                if role_list
            }
        except Exception:
            pass
        try:
            groups = await self.get_user_groups(realm, uid)
            result["groups"] = [g.get("name") or g.get("path", "") for g in groups]
        except Exception:
            pass
        return result

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

    # ── Protocol mapper management ────────────────────────────────────────────

    async def get_client_by_client_id(self, realm: str, client_id: str) -> Optional[dict]:
        """Return the first client whose ``clientId`` matches *client_id*, or None."""
        clients = await self._get(realm, "/clients", {"clientId": client_id})
        return clients[0] if clients else None

    async def get_client_mappers(self, realm: str, client_uuid: str) -> list[dict]:
        """Return all protocol mappers configured on a client."""
        return await self._get(realm, f"/clients/{client_uuid}/protocol-mappers/models")

    async def ensure_user_id_mapper(
        self,
        realm: str,
        client_id: str,
        attribute_name: str = "userId",
        claim_name: str = "userId",
    ) -> dict:
        """Idempotently add a ``userId`` user-attribute claim to the client's access token.

        Looks up the client by its ``clientId`` string, inspects existing protocol
        mappers, and creates the mapper only when absent.

        Args:
            realm:          Keycloak realm name.
            client_id:      The ``clientId`` string (not UUID) of the OIDC client.
            attribute_name: Keycloak user attribute to read (default ``userId``).
            claim_name:     JWT claim name to emit in the access token (default ``userId``).

        Returns a dict with ``created`` (bool) and ``mapper`` (the mapper definition).
        """
        client = await self.get_client_by_client_id(realm, client_id)
        if not client:
            raise ValueError(f"Client '{client_id}' not found in realm '{realm}'")

        client_uuid = client["id"]
        existing = await self.get_client_mappers(realm, client_uuid)

        # Check whether a mapper for this claim already exists
        for m in existing:
            if m.get("config", {}).get("claim.name") == claim_name:
                return {"created": False, "mapper": m}

        mapper_body = {
            "name": claim_name,
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-attribute-mapper",
            "consentRequired": False,
            "config": {
                "user.attribute":      attribute_name,
                "claim.name":          claim_name,
                "jsonType.label":      "String",
                "id.token.claim":      "false",
                "access.token.claim":  "true",
                "userinfo.token.claim": "false",
                "multivalued":         "false",
                "aggregate.attributes": "false",
            },
        }
        await self._post(realm, f"/clients/{client_uuid}/protocol-mappers/models", mapper_body)
        return {"created": True, "mapper": mapper_body}

    async def check_user_id_mapper(
        self,
        realm: str,
        client_id: str,
        claim_name: str = "userId",
    ) -> dict:
        """Check whether the ``userId`` claim mapper exists on a client.

        Returns ``{"exists": bool, "mapper": dict | None}``.
        """
        client = await self.get_client_by_client_id(realm, client_id)
        if not client:
            raise ValueError(f"Client '{client_id}' not found in realm '{realm}'")

        existing = await self.get_client_mappers(realm, client["id"])
        for m in existing:
            if m.get("config", {}).get("claim.name") == claim_name:
                return {"exists": True, "mapper": m}
        return {"exists": False, "mapper": None}

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

        # ── User queries ──────────────────────────────────────────────────────
        _USER_KW = (
            "user", "email", "who", "member", "assigned", "belong",
            "access", "account", "login", "person", "people", "staff",
            "role of", "roles of", "has role", "permission",
            "how many", "count", "total",
        )
        if any(kw in q for kw in _USER_KW):
            # 1. Always fetch the authoritative total count first.
            try:
                context["user_count"] = await self.get_user_count(realm)
            except Exception as e:
                errors.append(f"user_count: {e}")

            search_terms = _extract_user_search_terms(query)

            # 2. Build the basic user list — kept lightweight (no roles yet) so
            #    we can include everyone without blowing the token budget.
            all_users: list[dict] = []
            try:
                all_users = await self.get_users(realm, max=100)
            except Exception as e:
                errors.append(f"users_all: {e}")

            # Slim each user down to the fields the LLM needs for enumeration
            _BASIC_FIELDS = ("id", "username", "email", "firstName", "lastName", "enabled")
            context["users"] = [
                {k: u[k] for k in _BASIC_FIELDS if k in u}
                for u in all_users
            ]

            # 3. For queries that mention specific users, augment only those
            #    users with their full roles + groups so the LLM can answer
            #    permission questions without inflating the payload for everyone.
            if search_terms:
                named: list[dict] = []
                seen_ids: set[str] = set()
                for term in search_terms:
                    try:
                        for u in await self.search_users(realm, term):
                            if u["id"] not in seen_ids:
                                seen_ids.add(u["id"])
                                named.append(u)
                    except Exception as e:
                        errors.append(f"users({term}): {e}")

                if named:
                    detailed = []
                    for u in named[:10]:   # cap at 10 to avoid timeout
                        try:
                            detailed.append(await self.get_user_with_details(realm, u))
                        except Exception as e:
                            detailed.append(u)
                            errors.append(f"user_details({u.get('username')}): {e}")
                    context["users_with_roles"] = detailed

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


# Words that are never usernames — used to filter false positives
_STOP_WORDS = {
    "the", "a", "an", "this", "that", "my", "your", "their", "our",
    "user", "users", "role", "roles", "group", "groups", "realm",
    "client", "clients", "policy", "policies", "permission", "permissions",
    "access", "account", "accounts", "have", "has", "get", "show",
    "what", "which", "who", "where", "when", "why", "how",
    "does", "do", "did", "is", "are", "was", "were",
    "all", "any", "some", "no", "not", "and", "or", "for",
    "in", "on", "at", "to", "of", "with", "by", "from",
}


def _extract_user_search_terms(query: str) -> list[str]:
    """Extract likely username / email identifiers from a natural-language query.

    Strategies (applied in order, results deduplicated):
    1. Email addresses  (``john@example.com``)
    2. Words after context prepositions  ("for alice", "does bob", "user carol")
    3. Dotted / underscored tokens that look like login names  ("john.doe", "jane_smith")
    4. Quoted strings  (``"alice"`` or ``'bob'``)
    """
    terms: list[str] = []

    # 1. Email addresses
    terms += re.findall(r"[\w.+%-]+@[\w.-]+\.\w+", query)

    # 2. Words that follow user-identity prepositions / verbs
    for m in re.finditer(
        r"(?:user|does|is|for|about|of|on behalf of)\s+([\w.@+%-]{2,})",
        query,
        re.IGNORECASE,
    ):
        candidate = m.group(1).rstrip("?.,;:'\"")
        if candidate.lower() not in _STOP_WORDS:
            terms.append(candidate)

    # 3. Dotted / underscored identifiers that look like login names
    for m in re.finditer(r"\b([\w][\w.+-]{1,}[\w])\b", query):
        token = m.group(1)
        if ("." in token or "_" in token or "-" in token) and token.lower() not in _STOP_WORDS:
            terms.append(token)

    # 4. Quoted strings
    for m in re.finditer(r'"([^"]{2,}?)"|\'([^\']{2,}?)\'', query):
        terms.append(m.group(1) or m.group(2))

    # Deduplicate while preserving order; skip pure-stop-word matches
    seen: set[str] = set()
    result: list[str] = []
    for t in terms:
        if t and t.lower() not in _STOP_WORDS and t not in seen:
            seen.add(t)
            result.append(t)
    return result
