"""
Talent Suite Platform Agent — Agent Core
Orchestrates LLM calls + tool execution for IDP onboarding and updates.
Supports OpenAI and Google Gemini.
"""
import json
import os
import time
from typing import Optional

import httpx

from skill import IDP_SKILL_SCHEMA, AGENT_SYSTEM_PROMPT
from tools import (
    fetch_existing_idps,
    fetch_idp_by_domain,
    validate_idp_config,
    simulate_auth_flow,
    push_to_iam,
    generate_idp_config,
    log_llm_usage,
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


class IDPAgent:

    def get_skill_schema(self) -> dict:
        return IDP_SKILL_SCHEMA

    def get_existing_idps(self) -> list:
        return fetch_existing_idps()

    # ── LLM Calls ─────────────────────────────────────────────────────────────

    async def _call_openai(self, messages: list, system: str = AGENT_SYSTEM_PROMPT,
                           operation: str = "unknown") -> str:
        start = time.time()
        prompt_tokens = completion_tokens = 0
        success = False
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o",
                        "messages": [{"role": "system", "content": system}] + messages,
                        "temperature": 0.2,
                        "max_tokens": 2000
                    }
                )
                response.raise_for_status()
                data = response.json()
                usage = data.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                success = True
                return data["choices"][0]["message"]["content"]
        finally:
            duration_ms = int((time.time() - start) * 1000)
            log_llm_usage(operation, "openai", "gpt-4o", prompt_tokens, completion_tokens,
                          duration_ms, success)

    async def _call_gemini(self, messages: list, system: str = AGENT_SYSTEM_PROMPT,
                           operation: str = "unknown") -> str:
        start = time.time()
        prompt_tokens = completion_tokens = 0
        success = False
        try:
            contents = []
            for m in messages:
                role = "user" if m["role"] == "user" else "model"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}",
                    json={
                        "system_instruction": {"parts": [{"text": system}]},
                        "contents": contents,
                        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2000}
                    }
                )
                response.raise_for_status()
                data = response.json()
                usage_meta = data.get("usageMetadata", {})
                prompt_tokens = usage_meta.get("promptTokenCount", 0)
                completion_tokens = usage_meta.get("candidatesTokenCount", 0)
                success = True
                return data["candidates"][0]["content"]["parts"][0]["text"]
        finally:
            duration_ms = int((time.time() - start) * 1000)
            log_llm_usage(operation, "gemini", "gemini-2.0-flash", prompt_tokens, completion_tokens,
                          duration_ms, success)

    async def _llm(self, messages: list, provider: str = "openai",
                   system: str = AGENT_SYSTEM_PROMPT, operation: str = "unknown") -> str:
        if provider == "gemini":
            return await self._call_gemini(messages, system, operation)
        return await self._call_openai(messages, system, operation)

    # ── Missing field detection ────────────────────────────────────────────────

    def _find_missing_fields(self, inputs: dict, protocol: str = "saml") -> list:
        schema = IDP_SKILL_SCHEMA.get(protocol, {})
        required = schema.get("required", [])
        missing = []
        for field_def in required:
            if not inputs.get(field_def["field"]):
                missing.append(field_def)
        return missing

    # ── Onboard new IDP ───────────────────────────────────────────────────────

    async def onboard_idp(self, inputs: dict, llm_provider: str = "openai", token: Optional[str] = None) -> dict:
        protocol = inputs.get("protocol", "saml")

        # Step 1: Check for missing fields
        missing = self._find_missing_fields(inputs, protocol)
        if missing:
            missing_summary = "\n".join([f"- {f['label']}: {f['description']}" for f in missing])
            prompt = f"""The user wants to onboard a new IDP but is missing these required fields:
{missing_summary}

Current inputs provided:
{json.dumps({k: v for k, v in inputs.items() if v}, indent=2)}

Ask the user clearly and specifically for each missing field. Be concise and helpful."""

            clarification = await self._llm(
                [{"role": "user", "content": prompt}],
                provider=llm_provider,
                operation="onboard_idp",
            )
            return {
                "status": "needs_input",
                "missing_fields": missing,
                "message": clarification
            }

        # Step 2: Fetch existing patterns
        existing = fetch_existing_idps()

        # Step 3: Generate config
        config = generate_idp_config(inputs, existing)

        # Step 4: LLM review of config
        review_prompt = f"""Review this IDP config for any issues or improvements based on these existing patterns:

Existing IDPs (patterns to follow):
{json.dumps(existing[:3], indent=2, default=str)}

New config to review:
{json.dumps(config, indent=2, default=str)}

Respond with JSON only:
{{
  "issues": ["list of issues if any"],
  "suggestions": ["list of suggestions"],
  "approved": true/false
}}"""

        review_raw = await self._llm(
            [{"role": "user", "content": review_prompt}],
            provider=llm_provider,
            operation="onboard_idp",
        )
        try:
            review = json.loads(review_raw.strip().replace("```json", "").replace("```", ""))
        except Exception:
            review = {"issues": [], "suggestions": [], "approved": True}

        # Step 5: Validate
        validation = validate_idp_config(config, protocol)
        if not validation["valid"]:
            return {
                "status": "validation_failed",
                "config": config,
                "validation": validation,
                "llm_review": review
            }

        # Step 6: Simulate auth flow
        simulation = await simulate_auth_flow(config)
        if not simulation["simulation_passed"]:
            return {
                "status": "simulation_failed",
                "config": config,
                "validation": validation,
                "simulation": simulation,
                "llm_review": review
            }

        # Step 7: Push to IAM
        push_result = await push_to_iam(config, operation="create", token=token)

        return {
            "status": "success" if push_result["success"] else "push_failed",
            "config": config,
            "validation": validation,
            "simulation": simulation,
            "llm_review": review,
            "iam_response": push_result
        }

    # ── Update existing IDP ───────────────────────────────────────────────────

    async def update_idp(self, email_domain: str, updates: dict, llm_provider: str = "openai", token: Optional[str] = None) -> dict:
        # Step 1: Fetch existing config
        existing_config = fetch_idp_by_domain(email_domain, token)
        if not existing_config:
            return {"status": "not_found", "message": f"No IDP found for domain '{email_domain}'"}

        # Step 2: Apply updates
        updated_config = {**existing_config, **updates}

        # Step 3: Validate
        protocol = updated_config.get("protocol", "saml")
        validation = validate_idp_config(updated_config, protocol)
        if not validation["valid"]:
            return {
                "status": "validation_failed",
                "original_config": existing_config,
                "updated_config": updated_config,
                "validation": validation
            }

        # Step 4: Push to IAM
        push_result = await push_to_iam(updated_config, operation="update", token=token)

        return {
            "status": "success" if push_result["success"] else "push_failed",
            "original_config": existing_config,
            "updated_config": updated_config,
            "changes": updates,
            "validation": validation,
            "iam_response": push_result
        }

    # ── Conversational chat ───────────────────────────────────────────────────

    async def chat(self, message: str, context: Optional[dict], llm_provider: str = "openai") -> dict:
        """Handles free-form chat, e.g. asking for missing info."""
        context_str = json.dumps(context, indent=2, default=str) if context else "No prior context."

        messages = [
            {"role": "user", "content": f"Context:\n{context_str}\n\nUser message: {message}"}
        ]

        reply = await self._llm(messages, provider=llm_provider, operation="chat")
        return {"reply": reply}
