from dotenv import load_dotenv
load_dotenv()  # Must run before any project module is imported (they read env vars at module level)

from contextlib import asynccontextmanager
import os
from typing import Optional

import json

import httpx
import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import IDPAgent
from auth import require_admin, verify_token
from chat_engine import UnifiedChatEngine
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
    get_user_details,
    get_user_groups_by_client,
    get_users_by_client,
    lock_unlock_users,
    reset_user_password,
    search_users,
    send_magic_link,
    update_user_status,
)
from policy_engine import PolicyQueryEngine
from tools import (
    core_create_domain_attributes,
    core_get_domain_attributes,
    core_upsert_domain_attributes,
    fetch_idp_by_domain,
    get_chat_sessions,
    get_recent_usage,
    get_session_messages,
    get_usage_by_provider,
    get_usage_summary,
    get_usage_timeline,
    save_chat_message,
    scan_all_certificates,
)


def _downstream_detail(exc: httpx.HTTPStatusError) -> str:
    """Extract a human-readable message from a downstream API error response.

    Handles the two common formats seen in the wild:
    - NestJS:  {"message": "...", "error": "...", "statusCode": 400}
    - IAM API: {"status_code": 400, "error_details": {"code": "...", "message": "..."}}
    Falls back to the raw response text when the body is not JSON.
    """
    try:
        body = exc.response.json()
        if "error_details" in body:
            ed = body["error_details"]
            msg = ed.get("message", "")
            code = ed.get("code", "")
            return f"{msg} (code {code})" if code else msg
        if "message" in body:
            return body["message"]
    except Exception:
        pass
    return exc.response.text or f"HTTP {exc.response.status_code}"


# ── APScheduler — daily certificate scan ─────────────────────────────────────

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    _scheduler = AsyncIOScheduler()

    @_scheduler.scheduled_job("cron", hour=8)
    async def _daily_cert_scan():
        scan_all_certificates()

    _has_scheduler = True
except ImportError:
    _has_scheduler = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    if _has_scheduler:
        _scheduler.start()
    yield
    if _has_scheduler:
        _scheduler.shutdown(wait=False)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Keycloak IDP Onboarding Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = IDPAgent()
kc_admin = KeycloakAdminClient()
policy_engine = PolicyQueryEngine(kc_admin)
unified_engine = UnifiedChatEngine(kc_admin)


# ── Request models ────────────────────────────────────────────────────────────

class OnboardRequest(BaseModel):
    idp_name: str
    protocol: str  # saml or oidc
    entity_id: Optional[str] = None
    sso_url: Optional[str] = None
    certificate: Optional[str] = None
    email_domains: Optional[list] = None   # one or more email domains
    metadata_xml: Optional[str] = None
    extra_attributes: Optional[dict] = None
    llm_provider: str = "openai"


class UpdateRequest(BaseModel):
    email_domain: str
    updates: dict
    llm_provider: str = "openai"


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None     # kept for backwards compatibility
    llm_provider: str = "openai"
    session_id: Optional[str] = None   # omit to start a new session
    realm: Optional[str] = None        # Keycloak realm (defaults to KEYCLOAK_REALM env var)


class RotateRequest(BaseModel):
    email_domain: str
    new_certificate: str
    llm_provider: str = "openai"


class PolicyQueryRequest(BaseModel):
    question: str
    realm: str = "master"
    llm_provider: str = "openai"
    session_id: Optional[str] = None   # omit to start a new policy session


# ── Core endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/idps")
def list_idps():
    """Fetch all existing IDP configs from DB."""
    return agent.get_existing_idps()


@app.get("/idps/{email_domain}")
async def get_idp(email_domain: str, user: dict = Depends(verify_token)):
    """Fetch a single IDP config by email domain (any authenticated user)."""
    import logging
    log = logging.getLogger("idp")
    token = user.get("access_token")
    import os as _os
    log.warning("GET /idps/%s  token_present=%s  core_url=%s",
                email_domain, bool(token), _os.getenv("CORE_API_BASE_URL", "")[:40])
    try:
        result = await core_get_domain_attributes(email_domain, token)
    except httpx.HTTPStatusError as exc:
        log.warning("Core API HTTP error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Core API error {exc.response.status_code}: {exc.response.text}",
        )
    except httpx.RequestError as exc:
        log.warning("Core API request error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Core API unreachable: {exc}")
    if result is None:
        log.warning("core_get_domain_attributes returned None for %s", email_domain)
        raise HTTPException(status_code=404, detail=f"No IDP found for domain '{email_domain}'")
    return result


@app.post("/onboard")
async def onboard_idp(req: OnboardRequest, user: dict = Depends(require_admin)):
    """Onboard a new IDP (admin only)."""
    result = await agent.onboard_idp(req.dict(), req.llm_provider, token=user.get("access_token"))
    return result


@app.post("/onboard-user")
async def onboard_idp_self(req: OnboardRequest, user: dict = Depends(verify_token)):
    """Self-service onboard — any authenticated user can register an IDP for their own email domain."""
    result = await agent.onboard_idp(req.dict(), req.llm_provider, token=user.get("access_token"))
    return result


@app.post("/update")
async def update_idp(req: UpdateRequest, user: dict = Depends(require_admin)):
    """Update an existing IDP (admin only)."""
    result = await agent.update_idp(req.email_domain, req.updates, req.llm_provider, token=user.get("access_token"))
    return result


@app.post("/chat")
async def chat(req: ChatRequest, user: dict = Depends(verify_token)):
    """
    Multi-service conversational interface.
    Queries Keycloak, IAM, and Core APIs via LLM function-calling.
    Every turn is persisted to the user's chat history.
    """
    import uuid
    session_id = req.session_id or str(uuid.uuid4())
    user_sub   = user.get("sub", "anonymous")
    user_email = user.get("email", "")
    token      = user.get("access_token")
    realm      = req.realm or os.getenv("KEYCLOAK_REALM", "master")

    # Load conversation history BEFORE saving the new message so it isn't
    # included twice in the context passed to the engine.
    history_rows = get_session_messages(session_id, user_sub)
    history = [{"role": r["role"], "content": r["message"]} for r in history_rows]

    # Persist the user turn
    save_chat_message(session_id, user_sub, user_email, "user", req.message)

    # Call the unified multi-service engine
    result = await unified_engine.chat(
        message=req.message,
        history=history,
        realm=realm,
        token=token,
        provider=req.llm_provider,
    )

    reply = result.get("reply", "")
    save_chat_message(session_id, user_sub, user_email, "assistant", reply)

    return {**result, "session_id": session_id}


@app.get("/chat/sessions")
async def list_chat_sessions(user: dict = Depends(verify_token)):
    """Return the current user's recent chat sessions (newest first)."""
    return get_chat_sessions(user.get("sub", "anonymous"))


@app.get("/chat/sessions/{session_id}")
async def get_chat_session(session_id: str, user: dict = Depends(verify_token)):
    """Return all messages in a session (ownership enforced by user_sub)."""
    messages = get_session_messages(session_id, user.get("sub", "anonymous"))
    if not messages:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "messages": messages}


@app.get("/skill/schema")
def get_skill_schema():
    """Return the IDP skill schema so the UI knows what fields are required."""
    return agent.get_skill_schema()


# ── Usage endpoints (Item 1) ──────────────────────────────────────────────────

@app.get("/usage/summary")
def usage_summary(_: dict = Depends(verify_token)):
    """Total tokens and cost by operation for the last 30 days."""
    return get_usage_summary()


@app.get("/usage/by-provider")
def usage_by_provider(_: dict = Depends(verify_token)):
    """Token and cost breakdown by LLM provider / model."""
    return get_usage_by_provider()


@app.get("/usage/timeline")
def usage_timeline(_: dict = Depends(verify_token)):
    """Daily token usage over the last 30 days."""
    return get_usage_timeline()


@app.get("/usage/operations")
def usage_operations(_: dict = Depends(verify_token)):
    """Most expensive operations ranked by cost."""
    summary = get_usage_summary()
    return sorted(summary["by_operation"], key=lambda x: x.get("cost", 0), reverse=True)


@app.get("/usage/recent")
def usage_recent(_: dict = Depends(verify_token)):
    """50 most recent LLM call records."""
    return get_recent_usage()


# ── Certificate endpoints (Item 3) ────────────────────────────────────────────

@app.get("/certificates/scan")
def cert_scan(_: dict = Depends(verify_token)):
    """Scan all IDPs and return certificate expiry status."""
    return scan_all_certificates()


@app.get("/certificates/expiring")
def cert_expiring(_: dict = Depends(verify_token)):
    """Return only IDPs with certificates expiring within 30 days."""
    results = scan_all_certificates()
    return [r for r in results
            if r["certificate_status"].get("days_remaining", 999) < 30]


@app.post("/certificates/rotate")
async def cert_rotate(req: RotateRequest, user: dict = Depends(require_admin)):
    """Accept a new certificate for a domain and push it to IAM."""
    result = await agent.update_idp(
        req.email_domain,
        {"certificate": req.new_certificate},
        req.llm_provider,
        token=user.get("access_token"),
    )
    return result


@app.post("/certificates/schedule-scan")
def cert_schedule_scan(user: dict = Depends(require_admin)):
    """Return status of the automated daily scan scheduler."""
    if _has_scheduler:
        return {"scheduled": True, "message": "Daily cert scan runs at 08:00 server time."}
    return {"scheduled": False, "message": "apscheduler not installed. Run: pip install apscheduler"}


# ── Policy Query Engine endpoints ────────────────────────────────────────────

@app.get("/policy/realms")
async def get_policy_realms(_: dict = Depends(verify_token)):
    """List all Keycloak realms visible to the service account."""
    return await policy_engine.get_available_realms()


@app.post("/policy/query")
async def policy_query(req: PolicyQueryRequest, user: dict = Depends(verify_token)):
    """Answer a natural-language question about Keycloak roles, policies, and users.

    Every turn is saved to the shared chat_history store so the Policy Assistant
    page can reload its conversation across navigation and page refreshes.
    The response always echoes back the ``session_id`` so the client can persist it.
    """
    import uuid as _uuid
    session_id = req.session_id or f"policy:{_uuid.uuid4()}"
    user_sub   = user.get("sub", "anonymous")
    user_email = user.get("email", "")

    save_chat_message(session_id, user_sub, user_email, "user", req.question)

    result = await policy_engine.query(req.question, req.realm, req.llm_provider)

    # Persist the full structured response as JSON so the frontend can replay it.
    save_chat_message(session_id, user_sub, user_email, "assistant", json.dumps(result))

    return {**result, "session_id": session_id}


@app.get("/policy/roles/{realm}")
async def get_policy_roles(realm: str, _: dict = Depends(verify_token)):
    """Return all realm-level roles for the given realm."""
    return await kc_admin.get_realm_roles(realm)


@app.get("/policy/clients/{realm}")
async def get_policy_clients(realm: str, _: dict = Depends(verify_token)):
    """Return all clients for the given realm."""
    return await kc_admin.get_clients(realm)


@app.get("/policy/user/{realm}/{username}")
async def get_user_policy(realm: str, username: str, _: dict = Depends(verify_token)):
    """Return roles and groups for the first user matching the given username / email."""
    users = await kc_admin.search_users(realm, username)
    if not users:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found in realm '{realm}'")
    user = users[0]
    roles  = await kc_admin.get_user_roles(realm, user["id"])
    groups = await kc_admin.get_user_groups(realm, user["id"])
    return {"user": user, "roles": roles, "groups": groups}


# ── Core API proxy endpoints (/v2/clients/customAttributes) ──────────────────

class CoreAttributesBody(BaseModel):
    entityId: Optional[str] = None
    assertionConsumerServiceUrl: Optional[str] = None
    singleLogoutServiceUrl: Optional[str] = None
    singleSignOnServiceUrl: Optional[str] = None
    idpEntityId: Optional[str] = None
    idpX509Cert: Optional[str] = None
    spX509Cert: Optional[str] = None
    privateKey: Optional[str] = None
    validateSignature: Optional[bool] = None
    authnRequestsSigned: Optional[bool] = None
    assertionSigned: Optional[bool] = None
    assertionEncrypted: Optional[bool] = None


@app.get("/core/customAttributes")
async def get_domain_attributes(domainUrl: str, user: dict = Depends(verify_token)):
    """GET SSO attributes for a domain from the Core API."""
    result = await core_get_domain_attributes(domainUrl, user.get("access_token"))
    if result is None:
        raise HTTPException(status_code=404, detail=f"Domain '{domainUrl}' not found in Core API")
    return result


@app.post("/core/customAttributes")
async def create_domain_attributes(
    domainUrl: str,
    body: CoreAttributesBody,
    user: dict = Depends(require_admin),
):
    """POST — create new SSO attributes for a domain in the Core API (fails on 409 if already exists)."""
    result = await core_create_domain_attributes(domainUrl, body.dict(exclude_none=True), user.get("access_token"))
    if not result.get("success"):
        raise HTTPException(
            status_code=result.get("status_code", 500),
            detail=result.get("error", "Core API error"),
        )
    return result


@app.put("/core/customAttributes")
async def upsert_domain_attributes(
    domainUrl: str,
    body: CoreAttributesBody,
    user: dict = Depends(require_admin),
):
    """PUT — upsert SSO attributes for a domain in the Core API (create or update)."""
    result = await core_upsert_domain_attributes(domainUrl, body.dict(exclude_none=True), user.get("access_token"))
    if not result.get("success"):
        raise HTTPException(
            status_code=result.get("status_code", 500),
            detail=result.get("error", "Core API error"),
        )
    return result


# ── Platform: request models ──────────────────────────────────────────────────

class LockUsersRequest(BaseModel):
    action: str          # "lock" | "unlock"
    user_keys: list


class UserStatusRequest(BaseModel):
    status: str          # "active" | "inactive"
    user_keys: list


class ResetPasswordRequest(BaseModel):
    email: str


class MagicLinkRequest(BaseModel):
    email: str
    user_id: str
    redirect_url: str = ""


# ── Platform: Core API — clients ──────────────────────────────────────────────

@app.get("/platform/clients")
async def platform_list_clients(
    search: str = "",
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(verify_token),
):
    """List / search clients from the Core API."""
    try:
        return await get_clients(user.get("access_token"), search, page, limit)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/clients/{client_id}")
async def platform_get_client(client_id: str, user: dict = Depends(verify_token)):
    """Fetch a single client record by ID from the Core API."""
    try:
        return await get_client_by_id(client_id, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/clients/{client_id}/products")
async def platform_get_client_products(client_id: str, user: dict = Depends(verify_token)):
    """Products licensed for a client."""
    try:
        return await get_client_products(user.get("access_token"), client_id)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/clients/{client_id}/users")
async def platform_get_client_users(
    client_id: str,
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(verify_token),
):
    """Users belonging to a client (paginated)."""
    try:
        return await get_users_by_client(client_id, user.get("access_token"), page, limit)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/clients/{client_id}/groups")
async def platform_get_client_groups(client_id: str, user: dict = Depends(verify_token)):
    """User groups / teams for a client."""
    try:
        return await get_user_groups_by_client(client_id, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/login-mode")
async def platform_login_mode(email: str, user: dict = Depends(verify_token)):
    """Return the login mode (SSO/password) for an email address."""
    try:
        return await get_client_login_mode(email, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/products")
async def platform_list_products(user: dict = Depends(verify_token)):
    """All active products on the platform."""
    try:
        return await get_active_products(user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Platform: IAM API — users ─────────────────────────────────────────────────

@app.get("/platform/users/search")
async def platform_search_users(
    email: str = "",
    pams_id: str = "",
    user: dict = Depends(verify_token),
):
    """Search IAM users by email or PAMS ID."""
    if not email and not pams_id:
        raise HTTPException(status_code=400, detail="Provide a valid email or PAMS ID to search")
    if email and "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address — must contain '@'")
    try:
        return await search_users(email, user.get("access_token"), pams_id)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/users/{user_id}/details")
async def platform_get_user(user_id: str, user: dict = Depends(verify_token)):
    """Full user record including roles and teams."""
    try:
        return await get_user_details(user_id, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.patch("/platform/users/lock")
async def platform_lock_users(req: LockUsersRequest, user: dict = Depends(require_admin)):
    """Lock or unlock user accounts (admin only)."""
    try:
        return await lock_unlock_users(req.action, req.user_keys, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.patch("/platform/users/status")
async def platform_user_status(req: UserStatusRequest, user: dict = Depends(require_admin)):
    """Activate or deactivate user accounts (admin only)."""
    try:
        return await update_user_status(req.status, req.user_keys, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/platform/users/reset-password")
async def platform_reset_password(req: ResetPasswordRequest, user: dict = Depends(require_admin)):
    """Send a password reset email (admin only)."""
    try:
        return await reset_user_password(req.email, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/platform/users/magic-link")
async def platform_magic_link(req: MagicLinkRequest, user: dict = Depends(require_admin)):
    """Send a magic-link login email (admin only)."""
    try:
        return await send_magic_link(
            req.email, req.user_id, req.redirect_url, user.get("access_token")
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Platform: IAM API — roles, shadow users, communities ─────────────────────

@app.get("/platform/roles")
async def platform_list_roles(user: dict = Depends(verify_token)):
    """All IAM roles."""
    try:
        return await get_roles(user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/shadow-users")
async def platform_list_shadow_users(user: dict = Depends(verify_token)):
    """All shadow users (cross-client consultants)."""
    try:
        return await get_shadow_users(user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/shadow-users/{shadow_user_key}/clients")
async def platform_shadow_user_clients(shadow_user_key: str, user: dict = Depends(verify_token)):
    """Client access list for a shadow user."""
    try:
        return await get_shadow_user_clients(shadow_user_key, user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/platform/communities")
async def platform_list_communities(user: dict = Depends(verify_token)):
    """All communities (client groups)."""
    try:
        return await get_communities(user.get("access_token"))
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=_downstream_detail(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Admin: Keycloak token mapper management ───────────────────────────────────

@app.get("/admin/userid-mapper")
async def check_userid_mapper(
    realm: str,
    client_id: str,
    claim_name: str = "userId",
    _: dict = Depends(require_admin),
):
    """Check whether the userId claim mapper exists on a Keycloak client."""
    try:
        return await kc_admin.check_user_id_mapper(realm, client_id, claim_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/userid-mapper")
async def setup_userid_mapper(
    realm: str,
    client_id: str,
    attribute_name: str = "userId",
    claim_name: str = "userId",
    _: dict = Depends(require_admin),
):
    """Idempotently add a userId user-attribute protocol mapper to a Keycloak client.

    After this runs, every access token issued for *client_id* in *realm* will
    include a ``userId`` claim whose value comes from the user's ``userId``
    Keycloak attribute.  Re-running the endpoint when the mapper already exists
    is safe — it returns ``{"created": false, ...}`` without making any changes.
    """
    try:
        return await kc_admin.ensure_user_id_mapper(realm, client_id, attribute_name, claim_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
