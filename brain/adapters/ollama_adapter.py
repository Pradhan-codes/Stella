"""Concrete Ollama LLM adapter for Stella Python Brain.

Communicates with a local Ollama daemon over HTTP loopback, providing
health checks, model availability verification, non-streaming generation,
and streaming token chunking.

CRITICAL SECURITY AND RELIABILITY RULES:
1. Strict Local Loopback Only: Only literal loopback endpoints (127.0.0.1, localhost, ::1)
   are permitted. Remote destinations, proxies, and redirects to external hosts are forbidden.
2. Never Automatically Download Models: Missing models return False or raise MODEL_NOT_FOUND.
   The adapter never calls /api/pull or downloads models.
3. Defense-in-Depth Logging: Prompts, private memories, credentials, and raw model output
   are NEVER logged. Only execution durations, token metrics, and error categories are logged.
4. Resource Cleanup: All HTTP responses and sockets are closed in finally blocks.
"""

import json
import logging
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, Iterator, List, Optional

from brain.adapters.base import (
    ChatMessage,
    LLMAdapter,
    LLMAdapterError,
    LLMChunk,
    LLMGenerationParams,
    LLMResponse,
)

logger = logging.getLogger("stella.brain.adapters.ollama")

ALLOWED_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Disallows automatic redirects to prevent open-redirect / SSRF attacks."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise LLMAdapterError(
            category="INVALID_REQUEST",
            message=f"HTTP redirect blocked from {req.full_url} to {newurl}.",
            status_code=code,
        )


class OllamaAdapter(LLMAdapter):
    """Adapter for local Ollama inference service."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        model_name: str = "huihui_ai/Hermes-3-Llama-3.2-abliterated",
        ping_timeout_seconds: float = 2.0,
        turn_timeout_seconds: float = 90.0,
        transport: Optional[Callable[[urllib.request.Request, float], Any]] = None,
    ):
        """Initialize the Ollama adapter.

        Args:
            base_url: Local Ollama HTTP endpoint. Must resolve to a loopback address.
            model_name: Target model identifier.
            ping_timeout_seconds: Timeout for health probes.
            turn_timeout_seconds: Timeout for complete generation turns.
            transport: Optional injectable HTTP transport callable: (request, timeout) -> response_like.
                       Used for zero-network mocking in unit tests.

        Raises:
            ValueError: If base_url does not target a permitted local loopback host.
        """
        self._validate_loopback_url(base_url)
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.ping_timeout_seconds = ping_timeout_seconds
        self.turn_timeout_seconds = turn_timeout_seconds
        self._transport = transport

        # Build local-only opener: bypass all system proxies and block cross-host redirects
        self._opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),  # Empty dict disables all environment proxies
            _NoRedirectHandler(),
        )

    @staticmethod
    def _validate_loopback_url(url: str) -> None:
        """Verify URL strictly targets a local loopback interface."""
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid URL scheme '{parsed.scheme}'. Only 'http' or 'https' permitted.")
        
        hostname = (parsed.hostname or "").lower()
        if hostname not in ALLOWED_LOOPBACK_HOSTS:
            raise ValueError(
                f"Security violation: Host '{hostname}' is not a permitted local loopback destination. "
                f"Permitted loopback hosts: {sorted(list(ALLOWED_LOOPBACK_HOSTS))}."
            )

    def _open(self, req: urllib.request.Request, timeout: float) -> Any:
        """Execute HTTP request via custom transport if injected, else native opener."""
        if self._transport is not None:
            return self._transport(req, timeout)
        return self._opener.open(req, timeout=timeout)

    def ping(self) -> bool:
        """Check if local Ollama daemon is active and responsive.

        Returns:
            True if Ollama responds with HTTP 200 within ping_timeout_seconds, False otherwise.
        """
        url = f"{self.base_url}/api/tags"
        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", "StellaBrain/0.1.0")

        try:
            resp = self._open(req, timeout=self.ping_timeout_seconds)
            try:
                status = getattr(resp, "status", getattr(resp, "code", 200))
                return status == 200
            finally:
                if hasattr(resp, "close"):
                    resp.close()
        except Exception:
            return False

    def check_model_available(self, model_name: Optional[str] = None) -> bool:
        """Verify the specified model exists in the local Ollama registry.

        Never downloads or pulls models automatically.

        Args:
            model_name: Model identifier to check. Defaults to configured model_name.

        Returns:
            True if model is installed locally, False otherwise.

        Raises:
            LLMAdapterError: If Ollama daemon is offline or communication fails.
        """
        target = model_name or self.model_name
        url = f"{self.base_url}/api/tags"
        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", "StellaBrain/0.1.0")

        try:
            resp = self._open(req, timeout=self.ping_timeout_seconds)
            try:
                body = resp.read()
                data = json.loads(body.decode("utf-8"))
            finally:
                if hasattr(resp, "close"):
                    resp.close()

            models = data.get("models", [])
            for item in models:
                name = item.get("name", "")
                # Match exact name or name with/without ':latest' tag
                if name == target or name.split(":")[0] == target.split(":")[0]:
                    return True
            return False

        except LLMAdapterError:
            raise
        except (urllib.error.URLError, socket.error) as err:
            raise self._map_network_error(err)
        except Exception as err:
            raise LLMAdapterError(
                category="MALFORMED_RESPONSE",
                message=f"Failed to query Ollama model tags: {type(err).__name__}",
            )

    def generate(
        self,
        messages: List[ChatMessage],
        params: Optional[LLMGenerationParams] = None,
    ) -> LLMResponse:
        """Execute a non-streaming generation turn against Ollama /api/chat.

        Args:
            messages: List of chat messages.
            params: Optional generation parameters.

        Returns:
            LLMResponse containing the generated text and token metrics.

        Raises:
            LLMAdapterError: If inference fails, times out, or returns invalid data.
        """
        p = params or LLMGenerationParams()
        payload = self._build_chat_payload(messages, p, stream=False)
        req_bytes = json.dumps(payload).encode("utf-8")

        url = f"{self.base_url}/api/chat"
        req = urllib.request.Request(url, data=req_bytes, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "StellaBrain/0.1.0")

        start_time = time.perf_counter()
        resp = None
        try:
            resp = self._open(req, timeout=self.turn_timeout_seconds)
            raw_body = resp.read()
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            data = json.loads(raw_body.decode("utf-8"))
            message_obj = data.get("message", {})
            content = message_obj.get("content", "")
            prompt_tokens = data.get("prompt_eval_count")
            completion_tokens = data.get("eval_count")

            # Safe diagnostic logging (metadata only; never log prompt or message content)
            logger.info(
                "Ollama chat turn completed in %.2fms (prompt_tokens=%s, completion_tokens=%s)",
                elapsed_ms,
                prompt_tokens,
                completion_tokens,
            )

            return LLMResponse(
                content=content,
                finish_reason="stop" if data.get("done") else "length",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_duration_ms=elapsed_ms,
                model=data.get("model", self.model_name),
            )

        except LLMAdapterError:
            raise
        except urllib.error.HTTPError as err:
            raise self._map_http_error(err)
        except (urllib.error.URLError, socket.error) as err:
            raise self._map_network_error(err)
        except json.JSONDecodeError as err:
            raise LLMAdapterError(
                category="MALFORMED_RESPONSE",
                message=f"Ollama returned non-JSON response: {type(err).__name__}",
            )
        finally:
            if resp is not None and hasattr(resp, "close"):
                resp.close()

    def stream(
        self,
        messages: List[ChatMessage],
        params: Optional[LLMGenerationParams] = None,
    ) -> Iterator[LLMChunk]:
        """Execute a streaming generation turn, yielding LLMChunk deltas.

        Args:
            messages: List of chat messages.
            params: Optional generation parameters.

        Yields:
            LLMChunk instances as tokens are received.

        Raises:
            LLMAdapterError: If stream breaks or fails.
        """
        p = params or LLMGenerationParams()
        payload = self._build_chat_payload(messages, p, stream=True)
        req_bytes = json.dumps(payload).encode("utf-8")

        url = f"{self.base_url}/api/chat"
        req = urllib.request.Request(url, data=req_bytes, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "StellaBrain/0.1.0")

        resp = None
        try:
            resp = self._open(req, timeout=self.turn_timeout_seconds)
            for raw_line in resp:
                if not raw_line:
                    continue
                line_str = raw_line.decode("utf-8").strip() if isinstance(raw_line, bytes) else raw_line.strip()
                if not line_str:
                    continue

                try:
                    chunk_data = json.loads(line_str)
                except json.JSONDecodeError:
                    continue

                msg = chunk_data.get("message", {})
                delta_text = msg.get("content", "")
                is_done = chunk_data.get("done", False)

                chunk = LLMChunk(
                    delta_text=delta_text,
                    finish_reason="stop" if is_done else None,
                    prompt_tokens=chunk_data.get("prompt_eval_count") if is_done else None,
                    completion_tokens=chunk_data.get("eval_count") if is_done else None,
                )
                yield chunk

        except LLMAdapterError:
            raise
        except urllib.error.HTTPError as err:
            raise self._map_http_error(err)
        except (urllib.error.URLError, socket.error) as err:
            raise self._map_network_error(err)
        finally:
            if resp is not None and hasattr(resp, "close"):
                resp.close()

    def _build_chat_payload(
        self,
        messages: List[ChatMessage],
        params: LLMGenerationParams,
        stream: bool,
    ) -> Dict[str, Any]:
        """Construct Ollama /api/chat request dictionary."""
        formatted_messages = [
            {"role": m.role.value, "content": m.content}
            for m in messages
        ]

        options: Dict[str, Any] = {
            "temperature": params.temperature,
            "top_p": params.top_p,
            "num_predict": params.max_tokens,
            "repeat_penalty": params.repeat_penalty,
        }
        if params.stop_sequences:
            options["stop"] = params.stop_sequences

        payload: Dict[str, Any] = {
            "model": self.model_name,
            "messages": formatted_messages,
            "stream": stream,
            "options": options,
        }
        if params.format_json:
            payload["format"] = "json"

        return payload

    def _map_http_error(self, err: urllib.error.HTTPError) -> LLMAdapterError:
        """Map urllib HTTPError to typed LLMAdapterError with diagnostic classification."""
        status = err.code
        body_text = ""
        try:
            body_text = err.read().decode("utf-8", errors="replace").lower()
        except Exception:
            pass

        if status == 404:
            return LLMAdapterError(
                category="MODEL_NOT_FOUND",
                message=f"Model '{self.model_name}' not found on local Ollama server (HTTP 404).",
                status_code=status,
            )
        if status == 500:
            if "out of memory" in body_text or "cuda" in body_text or "vram" in body_text:
                return LLMAdapterError(
                    category="OUT_OF_VRAM",
                    message="Ollama failed due to GPU out-of-VRAM constraint.",
                    status_code=status,
                )
            return LLMAdapterError(
                category="MALFORMED_RESPONSE",
                message=f"Ollama server error (HTTP 500): {body_text[:128]}",
                status_code=status,
            )

        return LLMAdapterError(
            category="INVALID_REQUEST",
            message=f"Ollama returned HTTP {status}: {body_text[:128]}",
            status_code=status,
        )

    def _map_network_error(self, err: Exception) -> LLMAdapterError:
        """Map network and socket errors to typed LLMAdapterError."""
        err_str = str(err).lower()

        # Check for socket timeouts
        if isinstance(err, socket.timeout) or "timed out" in err_str:
            return LLMAdapterError(
                category="TIMEOUT",
                message=f"Request to local Ollama timed out: {type(err).__name__}",
            )

        # Check for connection refused / offline daemon
        if (
            isinstance(err, ConnectionRefusedError)
            or "refused" in err_str
            or "10061" in err_str  # Windows WSAECONNREFUSED
            or "actively refused" in err_str
        ):
            return LLMAdapterError(
                category="ENGINE_OFFLINE",
                message=f"Local Ollama engine is not running on {self.base_url}. Please start the Ollama daemon.",
            )

        return LLMAdapterError(
            category="CONNECTION_ERROR",
            message=f"Connection failure to Ollama: {type(err).__name__}",
        )
