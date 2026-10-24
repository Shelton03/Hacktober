"""
Gemma via Google Vertex AI — REST client (API-key / express-mode).

Design contract with the rest of the app:
- `suggest(prompt) -> LLMResult` is the ONE interface the app talks to.
- Every call is bounded (timeout), errors are caught and surfaced as
  LLMResult(success=False, error=...) — the app NEVER crashes because of the
  intelligence layer.
- Feature-flagged via settings.INTELLIGENCE_ENABLED; callers (advisor) fall
  back to a deterministic template when disabled or on failure.
- The client must be cheap to construct and safe to retry.

Endpoint (express mode, API key):
  POST https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent
  header: x-goog-api-key: $GOOGLE_API_KEY
Project-pinned variant (when VERTEX_PROJECT is set):
  POST https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent
"""
from __future__ import annotations

import json
import logging
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PUBLISHER_ENDPOINT = "https://aiplatform.googleapis.com/v1/publishers/google/models"
PROJECT_ENDPOINT = (
    "https://{location}-aiplatform.googleapis.com/v1/projects/{project}"
    "/locations/{location}/publishers/google/models"
)


class LLMResult:
    """Normalised response: text, success flag, timing, model, error detail."""

    def __init__(self, text: str = "", success: bool = False, model: str = "",
                 elapsed_s: float = 0.0, error: str = "", status_code: int | None = None):
        self.text = text
        self.success = success
        self.model = model
        self.elapsed_s = elapsed_s
        self.error = error
        self.status_code = status_code

    def __repr__(self):
        if self.success:
            return (
                f"<LLMResult ok model={self.model} {self.elapsed_s:.1f}s "
                f"chars={len(self.text)}>"
            )
        return f"<LLMResult FAIL {self.error[:120]}>"

    def to_dict(self):
        return {
            "success": self.success,
            "model": self.model,
            "text": self.text,
            "elapsed_s": round(self.elapsed_s, 2),
            "error": self.error,
        }


class GemmaVertexClient:
    """Gemma on Vertex AI via API key (express mode) or project-pinned URL.

    Feature-flagged, bounded, and failure-soft: never raises to callers.
    """

    def __init__(self, api_key: str | None = None, model: str | None = None,
                 timeout: int | None = None, max_output_tokens: int | None = None,
                 location: str | None = None, project: str | None = None):
        self.api_key = (api_key if api_key is not None else settings.GOOGLE_API_KEY).strip()
        self.model = model if model is not None else settings.GEMMA_MODEL
        self.timeout = timeout if timeout is not None else settings.GEMMA_TIMEOUT
        self.max_output_tokens = (
            max_output_tokens if max_output_tokens is not None
            else settings.GEMMA_MAX_OUTPUT_TOKENS
        )
        self.location = location if location is not None else settings.VERTEX_LOCATION
        self.project = project if project is not None else settings.VERTEX_PROJECT

    @property
    def endpoint(self) -> str:
        if self.project:
            return PROJECT_ENDPOINT.format(
                location=self.location, project=self.project, model=self.model
            )
        return f"{PUBLISHER_ENDPOINT}/{self.model}:generateContent"

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def suggest(self, prompt: str) -> LLMResult:
        """One-shot prompt → text. Never raises; always returns LLMResult."""
        if not settings.INTELLIGENCE_ENABLED:
            return LLMResult(
                success=False, model=self.model,
                error="Intelligence disabled by feature flag",
            )
        if not self.api_key:
            return LLMResult(
                success=False, model=self.model,
                error="GOOGLE_API_KEY not set in .env",
            )

        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        }
        if self.max_output_tokens > 0:
            payload["generationConfig"] = {"maxOutputTokens": self.max_output_tokens}

        started = time.monotonic()
        try:
            response = requests.post(
                self.endpoint, headers=headers, json=payload, timeout=self.timeout
            )
        except requests.RequestException as exc:
            logger.warning("Gemma call failed: %s", exc)
            return LLMResult(
                success=False, model=self.model,
                error=f"Network error: {exc}",
                elapsed_s=time.monotonic() - started,
            )
        elapsed = time.monotonic() - started

        if response.status_code != 200:
            snippet = response.text[:300]
            logger.warning("Gemma HTTP %s: %s", response.status_code, snippet)
            return LLMResult(
                success=False, model=self.model,
                error=f"HTTP {response.status_code}: {snippet}",
                status_code=response.status_code, elapsed_s=elapsed,
            )
        try:
            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                reason = data.get("promptFeedback", {}).get("blockReason", "no candidates")
                return LLMResult(
                    success=False, model=self.model,
                    error=f"No candidates ({reason})",
                    status_code=200, elapsed_s=elapsed,
                )
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(part.get("text", "") for part in parts).strip()
            if not text:
                finish = candidates[0].get("finishReason", "empty")
                return LLMResult(
                    success=False, model=self.model,
                    error=f"Empty response (finishReason={finish})",
                    status_code=200, elapsed_s=elapsed,
                )
        except json.JSONDecodeError as exc:
            return LLMResult(
                success=False, model=self.model, error=f"Bad JSON: {exc}",
                status_code=200, elapsed_s=elapsed,
            )
        return LLMResult(success=True, text=text, model=self.model, elapsed_s=elapsed)


def get_advisor_client() -> GemmaVertexClient:
    """Factory the advisor (and future channels) use to get the LLM client."""
    return GemmaVertexClient()
