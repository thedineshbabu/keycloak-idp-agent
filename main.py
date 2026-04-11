from contextlib import asynccontextmanager
from typing import Optional

import httpx
import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import IDPAgent
from auth import require_admin, verify_token
from tools import (
    core_create_domain_attributes,
    core_get_domain_attributes,
    core_upsert_domain_attributes,
    fetch_idp_by_domain,
    get_recent_usage,
    get_usage_by_provider,
    get_usage_summary,
    get_usage_timeline,
    log_cert_alerts,
    scan_all_certificates,
)


# ── APScheduler — daily certificate scan ─────────────────────────────────────

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    _scheduler = AsyncIOScheduler()

    @_scheduler.scheduled_job("cron", hour=8)
    async def _daily_cert_scan():
        results = scan_all_certificates()
        expiring = [r for r in results
                    if r["certificate_status"].get("days_remaining", 999) < 30]
        if expiring:
            log_cert_alerts(expiring)

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
    context: Optional[dict] = None
    llm_provider: str = "openai"


class RotateRequest(BaseModel):
    email_domain: str
    new_certificate: str
    llm_provider: str = "openai"


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
    token = user.get("access_token")
    try:
        result = await core_get_domain_attributes(email_domain, token)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Core API error: {exc.response.text}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Core API unreachable: {exc}")
    if result is None:
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
    """Conversational interface — agent asks for missing info."""
    result = await agent.chat(req.message, req.context, req.llm_provider)
    return result


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


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
