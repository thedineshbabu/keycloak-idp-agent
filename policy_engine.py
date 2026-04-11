"""
Policy Query Engine
Takes a natural-language question about Keycloak roles/policies/users,
builds a minimal context from the Admin API, and asks an LLM for a
structured answer.
"""
import json
import os
import time

import httpx

from keycloak_admin import KeycloakAdminClient
from tools import log_llm_usage

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

POLICY_SYSTEM_PROMPT = """
You are a Keycloak authorization expert assistant.

You will be given:
- A question about Keycloak roles, policies, permissions, or users.
- A JSON context object containing live data fetched from the Keycloak Admin API.

Rules:
1. Answer ONLY from the provided context — never guess or invent data.
2. Quote exact role names, client IDs, and policy names as they appear in the context.
3. If the context lacks sufficient data to answer, set confidence to "low" and describe what is missing in "missing_data".
4. Be concise in "answer" (1-3 sentences). Use "details" for elaboration.
5. Populate "sources" with the context keys you used (e.g. "realm role: admin", "client: my-app").

Respond with ONLY valid JSON matching this schema (no markdown fences):
{
  "answer":       "<direct one-to-three sentence answer>",
  "details":      "<elaboration with specifics from context>",
  "sources":      ["<source ref>", ...],
  "missing_data": "<what additional data would help, or 'None'>",
  "confidence":   "high" | "medium" | "low"
}
""".strip()


class PolicyQueryEngine:

    def __init__(self, kc_admin: KeycloakAdminClient):
        self.kc = kc_admin

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_available_realms(self) -> dict:
        """Return the list of realms the service account can see."""
        try:
            realms = await self.kc.get_realms()
            return {"status": "success", "realms": realms}
        except Exception as e:
            return {"status": "error", "error": str(e), "realms": []}

    async def query(self, question: str, realm: str, llm_provider: str) -> dict:
        """
        Answer a natural-language question about Keycloak authorization.

        Returns:
            {
                status, question, realm, answer, context_sources,
                token_usage, error (if any)
            }
        """
        # 1. Build context from Admin API
        try:
            context = await self.kc.build_context(realm, question)
        except Exception as e:
            return {
                "status":  "error",
                "question": question,
                "realm":   realm,
                "error":   f"Failed to fetch Keycloak context: {e}",
            }

        context_sources = [k for k in context if not k.startswith("_")]

        # 2. Build the user message
        user_message = (
            f"Question: {question}\n\n"
            f"Keycloak context (realm: {realm}):\n"
            f"{json.dumps(context, indent=2, default=str)}"
        )

        # 3. Call the LLM
        try:
            raw, token_usage = await self._llm(
                messages=[{"role": "user", "content": user_message}],
                provider=llm_provider,
            )
        except Exception as e:
            return {
                "status":  "error",
                "question": question,
                "realm":   realm,
                "error":   f"LLM call failed: {e}",
                "context_sources": context_sources,
            }

        # 4. Parse the JSON answer
        answer = _parse_json_answer(raw)

        return {
            "status":          "success",
            "question":        question,
            "realm":           realm,
            "answer":          answer,
            "context_sources": context_sources,
            "token_usage":     token_usage,
        }

    # ── LLM helpers ───────────────────────────────────────────────────────────

    async def _llm(self, messages: list, provider: str) -> tuple[str, dict]:
        if provider == "gemini":
            return await self._call_gemini(messages)
        return await self._call_openai(messages)

    async def _call_openai(self, messages: list) -> tuple[str, dict]:
        start = time.time()
        prompt_tokens = completion_tokens = 0
        success = False
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "gpt-4o",
                        "messages": [
                            {"role": "system", "content": POLICY_SYSTEM_PROMPT}
                        ] + messages,
                        "temperature": 0.1,
                        "max_tokens": 1500,
                        "response_format": {"type": "json_object"},
                    },
                )
                r.raise_for_status()
                data = r.json()
                usage = data.get("usage", {})
                prompt_tokens     = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                success = True
                text = data["choices"][0]["message"]["content"]
                return text, {
                    "prompt_tokens":     prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens":      prompt_tokens + completion_tokens,
                }
        finally:
            log_llm_usage(
                "policy_query", "openai", "gpt-4o",
                prompt_tokens, completion_tokens,
                int((time.time() - start) * 1000), success,
            )

    async def _call_gemini(self, messages: list) -> tuple[str, dict]:
        start = time.time()
        prompt_tokens = completion_tokens = 0
        success = False
        try:
            contents = [
                {"role": "user" if m["role"] == "user" else "model",
                 "parts": [{"text": m["content"]}]}
                for m in messages
            ]
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"gemini-1.5-pro:generateContent?key={GEMINI_API_KEY}",
                    json={
                        "system_instruction": {"parts": [{"text": POLICY_SYSTEM_PROMPT}]},
                        "contents": contents,
                        "generationConfig": {
                            "temperature": 0.1,
                            "maxOutputTokens": 1500,
                            "responseMimeType": "application/json",
                        },
                    },
                )
                r.raise_for_status()
                data = r.json()
                meta = data.get("usageMetadata", {})
                prompt_tokens     = meta.get("promptTokenCount", 0)
                completion_tokens = meta.get("candidatesTokenCount", 0)
                success = True
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return text, {
                    "prompt_tokens":     prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens":      prompt_tokens + completion_tokens,
                }
        finally:
            log_llm_usage(
                "policy_query", "gemini", "gemini-1.5-pro",
                prompt_tokens, completion_tokens,
                int((time.time() - start) * 1000), success,
            )


# ── helpers ───────────────────────────────────────────────────────────────────

def _parse_json_answer(raw: str) -> dict:
    """Try to parse the LLM's JSON response; fall back gracefully."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Strip markdown fences if the model added them anyway
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        try:
            return json.loads(cleaned.strip())
        except json.JSONDecodeError:
            return {
                "answer":       raw,
                "details":      "",
                "sources":      [],
                "missing_data": "Could not parse structured response from LLM.",
                "confidence":   "low",
            }
