"""
Embedding Context Engine
Vectorises PLATFORM_CONTEXT.md on startup.
On each query, semantically searches for the most relevant sections
and returns them as context for the LLM prompt.
"""

import hashlib
import logging
import os
import pathlib
import pickle
import re

import httpx
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

log = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

PLATFORM_SUMMARY = (
    "You are an intelligent assistant for the Talents Suite Platform.\n"
    "The platform serves 2,000+ enterprise clients with SSO authentication via Keycloak.\n"
    "You have access to live data sources: Core Service (client data), IAM Service\n"
    "(identity configs, users, roles), and Keycloak Admin API (realms, policies, users).\n"
    "Always use live API data to answer questions. Be specific and reference exact values."
)

_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "text-embedding-004:embedContent?key={key}"
)


class EmbeddingContextEngine:

    def __init__(
        self,
        docs_path: str = "PLATFORM_CONTEXT.md",
        cache_path: str | None = None,
    ):
        self.docs_path = docs_path
        self.cache_path: str = cache_path or str(
            pathlib.Path(__file__).resolve().parent / ".cache" / "embeddings.pkl"
        )
        self.sections: list[dict] = []
        self.embeddings: np.ndarray | None = None
        self._ready = False

    @property
    def is_ready(self) -> bool:
        return self._ready

    # ── Startup ──────────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Load the platform doc, split into sections, and embed each one.

        On subsequent startups the embeddings are loaded from a local cache if
        the source document has not changed (MD5 comparison), skipping all API
        calls.
        """
        if not GEMINI_API_KEY:
            log.warning("GEMINI_API_KEY not set — context engine disabled")
            return

        if not os.path.exists(self.docs_path):
            log.warning("%s not found — context engine disabled", self.docs_path)
            return

        # ── Cache check ──────────────────────────────────────────────────────
        if self._load_cache():
            self._ready = True
            return

        # ── Cache miss: read, split, embed ───────────────────────────────────
        log.info("Embedding cache miss — generating embeddings from %s", self.docs_path)

        with open(self.docs_path, encoding="utf-8") as f:
            content = f.read()

        raw = re.split(r"\n## ", content)
        self.sections = []
        for s in raw:
            lines = s.strip().split("\n")
            title = lines[0].replace("#", "").strip()
            body = "\n".join(lines[1:]).strip()
            if body:
                self.sections.append({"title": title, "content": body})

        if not self.sections:
            log.warning("No sections found in %s", self.docs_path)
            return

        texts = [f"{s['title']}\n{s['content']}" for s in self.sections]
        self.embeddings = await self._embed_batch(texts)
        self._ready = True
        log.info("Embedded %d sections from %s", len(self.sections), self.docs_path)

        # ── Persist for future restarts ──────────────────────────────────────
        self._save_cache()

    # ── Cache helpers ────────────────────────────────────────────────────────

    def _docs_hash(self) -> str:
        """Return the MD5 hex digest of the docs file content."""
        with open(self.docs_path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()

    def _load_cache(self) -> bool:
        """Load sections and embeddings from cache if it exists and is current.

        Returns True on a cache hit, False on miss, stale cache, or any error.
        """
        if not os.path.exists(self.cache_path):
            return False
        try:
            with open(self.cache_path, "rb") as f:
                cached_hash, sections, embeddings = pickle.load(f)
            if cached_hash != self._docs_hash():
                log.info("Embedding cache stale (docs changed) — will regenerate")
                return False
            self.sections = sections
            self.embeddings = embeddings
            log.info(
                "Embedding cache hit — loaded %d sections from %s",
                len(self.sections),
                self.cache_path,
            )
            return True
        except Exception as exc:
            log.warning("Failed to read embedding cache (%s) — will regenerate", exc)
            return False

    def _save_cache(self) -> None:
        """Persist the current hash, sections, and embeddings to disk."""
        try:
            pathlib.Path(self.cache_path).parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_path, "wb") as f:
                pickle.dump((self._docs_hash(), self.sections, self.embeddings), f)
            log.info("Embedding cache saved to %s", self.cache_path)
        except Exception as exc:
            log.warning("Failed to save embedding cache: %s", exc)

    # ── Embedding helpers ────────────────────────────────────────────────────

    async def _embed_batch(self, texts: list[str]) -> np.ndarray:
        embeddings = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            for text in texts:
                emb = await self._embed_single(client, text)
                embeddings.append(emb)
        return np.array(embeddings)

    async def _embed_single(
        self, client: httpx.AsyncClient, text: str
    ) -> list[float]:
        resp = await client.post(
            _EMBED_URL.format(key=GEMINI_API_KEY),
            json={
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": text[:8000]}]},
            },
        )
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]

    # ── Query-time retrieval ─────────────────────────────────────────────────

    async def get_relevant_context(self, query: str, top_k: int = 2) -> str:
        """Return the *top_k* most relevant sections for *query*."""
        if not self._ready or self.embeddings is None:
            return ""

        async with httpx.AsyncClient(timeout=15.0) as client:
            query_emb = await self._embed_single(client, query)

        query_vec = np.array(query_emb).reshape(1, -1)
        sims = cosine_similarity(query_vec, self.embeddings)[0]
        top_indices = sims.argsort()[-top_k:][::-1]

        parts = []
        for i in top_indices:
            sec = self.sections[i]
            parts.append(f"### {sec['title']}\n{sec['content']}")
        return "\n\n".join(parts)

    def get_summary(self) -> str:
        return PLATFORM_SUMMARY
