from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from agent import IDPAgent

app = FastAPI(title="Keycloak IDP Onboarding Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = IDPAgent()


class OnboardRequest(BaseModel):
    idp_name: str
    protocol: str  # saml or oidc
    entity_id: Optional[str] = None
    sso_url: Optional[str] = None
    certificate: Optional[str] = None
    email_domain: Optional[str] = None
    metadata_xml: Optional[str] = None
    extra_attributes: Optional[dict] = None
    llm_provider: str = "openai"  # openai or gemini


class UpdateRequest(BaseModel):
    email_domain: str
    updates: dict
    llm_provider: str = "openai"


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None
    llm_provider: str = "openai"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/idps")
def list_idps():
    """Fetch all existing IDP configs from DB"""
    return agent.get_existing_idps()


@app.post("/onboard")
async def onboard_idp(req: OnboardRequest):
    """Onboard a new IDP"""
    result = await agent.onboard_idp(req.dict(), req.llm_provider)
    return result


@app.post("/update")
async def update_idp(req: UpdateRequest):
    """Update an existing IDP"""
    result = await agent.update_idp(req.email_domain, req.updates, req.llm_provider)
    return result


@app.post("/chat")
async def chat(req: ChatRequest):
    """Conversational interface - agent asks for missing info"""
    result = await agent.chat(req.message, req.context, req.llm_provider)
    return result


@app.get("/skill/schema")
def get_skill_schema():
    """Return the IDP skill schema so UI knows what fields are required"""
    return agent.get_skill_schema()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
