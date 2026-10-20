"""Local Loopback HTTP API Server for Stella Python Brain.

Provides a minimal, secure, loopback-only HTTP interface enabling the
React + TypeScript local desktop UI to communicate with the central
BrainOrchestrator.

CRITICAL SECURITY RULES:
1. Strict Loopback Only: Only binds to 127.0.0.1. Rejects external network interfaces.
2. Origin Restriction: Enforces CORS allowed origins (Vite dev server and local UI).
3. Payload Bounds: Enforces Content-Length ceiling (max 64 KB) and input schema validation.
4. Untrusted Model Output: Proposed actions are returned as typed metadata only;
   never executed automatically.
5. No Secret Leakage: Confirmation tokens, private memories, prompts, and internal
   tracebacks are NEVER exposed over the API.
6. Session Isolation: Session IDs are validated against strict safe patterns; sessions
   remain isolated within the orchestrator.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import re
import socket
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Set, Type
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from brain.core.fsm import BrainState
from brain.core.orchestrator import (
    BrainOrchestrator,
    OrchestratorResponse,
    OrchestratorTurnStatus,
)

logger = logging.getLogger("stella.brain.service")

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

ALLOWED_LOOPBACK_IPS = {"127.0.0.1", "localhost", "::1"}


# ============================================================================
# Request / Response Schemas
# ============================================================================

class BrainServerSettings(BaseModel):
    """Configuration for local loopback HTTP service."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    host: str = Field(
        default="127.0.0.1",
        description="Binding interface. Strictly restricted to local loopback.",
    )
    port: int = Field(
        default=8000,
        ge=0,
        le=65535,
        description="Local port to bind. 0 selects a dynamic available port for testing.",
    )
    max_payload_bytes: int = Field(
        default=65536,
        ge=1024,
        le=1048576,
        description="Maximum allowed request payload size in bytes (default 64 KB).",
    )
    allowed_origins: List[str] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_ORIGINS),
        description="Permitted browser Origin header values.",
    )

    @field_validator("host")
    @classmethod
    def validate_loopback_only(cls, v: str) -> str:
        """Reject binding to non-loopback network interfaces."""
        normalized = v.strip().lower()
        if normalized not in ALLOWED_LOOPBACK_IPS:
            raise ValueError(
                f"Security violation: BrainServer host '{v}' is not a local loopback address. "
                f"Permitted addresses: {sorted(list(ALLOWED_LOOPBACK_IPS))}."
            )
        return normalized


class TurnRequestPayload(BaseModel):
    """Validated inbound conversational turn request from local UI."""

    model_config = ConfigDict(extra="forbid")

    user_message: str = Field(
        min_length=1,
        max_length=4096,
        description="User text message to process.",
    )
    session_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        pattern=r"^[a-zA-Z0-9_\-]+$",
        description="Optional session identifier for conversational continuity.",
    )
    perceptual_state: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional situational context (active planet, station mode, etc.).",
    )


class ActionProposalSummary(BaseModel):
    """Untrusted action proposal metadata returned for client awareness."""

    model_config = ConfigDict(extra="forbid")

    proposal_id: str
    action_name: str
    parameters: Dict[str, Any]
    intent_summary: str
    risk_level: str


class ConfirmationPromptSummary(BaseModel):
    """Confirmation prompt metadata without sensitive verification tokens."""

    model_config = ConfigDict(extra="forbid")

    prompt_id: str
    proposal_id: str
    action_name: str
    summary: str
    affected_targets: List[str]
    risk_level: str


class TurnResponsePayload(BaseModel):
    """Outbound turn response delivered to the local UI."""

    model_config = ConfigDict(extra="forbid")

    turn_id: str
    session_id: str
    status: str
    user_facing_text: str
    expression_hint: Optional[str] = None
    proposed_actions: List[ActionProposalSummary] = Field(default_factory=list)
    confirmation_prompts: List[ConfirmationPromptSummary] = Field(default_factory=list)
    duration_ms: float = 0.0
    error_message: Optional[str] = None


class HealthResponsePayload(BaseModel):
    """Status probe response."""

    model_config = ConfigDict(extra="forbid")

    status: str
    fsm_state: str
    model: str
    ollama_connected: bool
    version: str


# ============================================================================
# HTTP Request Handler Factory
# ============================================================================

def create_handler_class(
    orchestrator: BrainOrchestrator,
    settings: BrainServerSettings,
) -> Type[BaseHTTPRequestHandler]:
    """Create a configured BaseHTTPRequestHandler class binding the orchestrator."""

    allowed_origins_set: Set[str] = set(settings.allowed_origins)

    class BrainHTTPRequestHandler(BaseHTTPRequestHandler):
        server_version = "StellaBrainHTTP/0.1.0"

        def _is_origin_allowed(self) -> bool:
            """Check if Origin header is present and permitted."""
            origin = self.headers.get("Origin")
            if not origin:
                # Direct local non-browser requests or Electron file:// context
                return True
            origin_clean = origin.rstrip("/")
            if origin_clean in allowed_origins_set:
                return True
            # Also allow loopback on any port if origin is loopback
            parsed = urlparse(origin_clean)
            hostname = (parsed.hostname or "").lower()
            if hostname in ALLOWED_LOOPBACK_IPS and origin_clean in allowed_origins_set:
                return True
            return False

        def _send_cors_headers(self) -> None:
            """Emit restrictive CORS headers for permitted origins."""
            origin = self.headers.get("Origin")
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
                self.send_header("Access-Control-Max-Age", "86400")
                self.send_header("Vary", "Origin")

        def _send_json_response(self, status_code: int, data: Dict[str, Any]) -> None:
            """Send a JSON formatted response with secure headers."""
            body_bytes = json.dumps(data).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body_bytes)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(body_bytes)

        def _send_error_json(self, status_code: int, message: str, code: str = "ERROR") -> None:
            """Send a sanitized error response without tracebacks or secrets."""
            self._send_json_response(status_code, {
                "error": message,
                "code": code,
                "status": "error",
            })

        def do_OPTIONS(self) -> None:
            """Handle CORS preflight requests."""
            if not self._is_origin_allowed():
                self.send_response(403)
                self.end_headers()
                return

            self.send_response(204)
            self._send_cors_headers()
            self.end_headers()

        def do_GET(self) -> None:
            """Handle GET endpoints."""
            if not self._is_origin_allowed():
                self._send_error_json(403, "Forbidden origin", "UNAUTHORIZED_ORIGIN")
                return

            parsed_path = urlparse(self.path).path.rstrip("/")
            if parsed_path in ("/health", "/api/health", ""):
                # Check Ollama connectivity if adapter exists
                ollama_ok = False
                try:
                    if hasattr(orchestrator, "llm_adapter") and orchestrator.llm_adapter:
                        ollama_ok = orchestrator.llm_adapter.ping()
                except Exception:
                    ollama_ok = False

                health = HealthResponsePayload(
                    status="ok",
                    fsm_state=orchestrator.fsm.state.value,
                    model=orchestrator.settings.model_identifier,
                    ollama_connected=ollama_ok,
                    version=orchestrator.settings.version,
                )
                self._send_json_response(200, health.model_dump())
            else:
                self._send_error_json(404, f"Endpoint '{parsed_path}' not found", "NOT_FOUND")

        def do_POST(self) -> None:
            """Handle POST endpoints."""
            if not self._is_origin_allowed():
                self._send_error_json(403, "Forbidden origin", "UNAUTHORIZED_ORIGIN")
                return

            parsed_path = urlparse(self.path).path.rstrip("/")
            if parsed_path != "/api/turn":
                self._send_error_json(404, f"Endpoint '{parsed_path}' not found", "NOT_FOUND")
                return

            # 1. Validate Content-Length
            content_length_header = self.headers.get("Content-Length")
            if not content_length_header:
                self._send_error_json(411, "Missing Content-Length header", "LENGTH_REQUIRED")
                return

            try:
                content_length = int(content_length_header)
            except ValueError:
                self._send_error_json(400, "Invalid Content-Length header", "BAD_REQUEST")
                return

            if content_length > settings.max_payload_bytes:
                self._send_error_json(
                    413,
                    f"Payload size ({content_length} bytes) exceeds maximum limit ({settings.max_payload_bytes} bytes)",
                    "PAYLOAD_TOO_LARGE",
                )
                return

            if content_length <= 0:
                self._send_error_json(400, "Request body cannot be empty", "EMPTY_PAYLOAD")
                return

            # 2. Read exact body bytes
            try:
                body_bytes = self.rfile.read(content_length)
            except Exception as err:
                logger.warning("Error reading request body: %s", type(err).__name__)
                self._send_error_json(400, "Failed to read request body", "READ_ERROR")
                return

            # 3. Schema validation via Pydantic
            try:
                req_data = TurnRequestPayload.model_validate_json(body_bytes)
            except Exception as parse_err:
                logger.info("Rejected invalid turn request payload: %s", type(parse_err).__name__)
                self._send_error_json(400, "Invalid request schema", "VALIDATION_ERROR")
                return

            # 4. Dispatch turn through BrainOrchestrator
            try:
                orchestrator_resp: OrchestratorResponse = orchestrator.handle_turn(
                    user_message=req_data.user_message,
                    session_id=req_data.session_id,
                    perceptual_state=req_data.perceptual_state,
                )

                # Map proposed actions (metadata only; never executed)
                action_summaries = [
                    ActionProposalSummary(
                        proposal_id=str(p.proposal_id),
                        action_name=p.action_name,
                        parameters=p.parameters,
                        intent_summary=p.intent_summary,
                        risk_level=p.risk_level.value if hasattr(p.risk_level, "value") else str(p.risk_level),
                    )
                    for p in orchestrator_resp.proposed_actions
                ]

                # Map confirmation prompts (tokens are strictly excluded)
                prompt_summaries = [
                    ConfirmationPromptSummary(
                        prompt_id=str(cp.prompt_id),
                        proposal_id=str(cp.proposal_id),
                        action_name=cp.action_name,
                        summary=getattr(cp, "human_readable_summary", getattr(cp, "summary", "")),
                        affected_targets=list(getattr(cp, "affected_targets", [])),
                        risk_level=str(
                            getattr(cp.risk_tier, "value", cp.risk_tier)
                            if hasattr(cp, "risk_tier")
                            else getattr(cp, "risk_level", "consequential")
                        ),
                    )
                    for cp in orchestrator_resp.confirmation_prompts
                ]

                turn_resp = TurnResponsePayload(
                    turn_id=orchestrator_resp.turn_id,
                    session_id=orchestrator_resp.session_id,
                    status=orchestrator_resp.status.value,
                    user_facing_text=orchestrator_resp.user_facing_text,
                    expression_hint=orchestrator_resp.expression_hint,
                    proposed_actions=action_summaries,
                    confirmation_prompts=prompt_summaries,
                    duration_ms=orchestrator_resp.duration_ms,
                    error_message=orchestrator_resp.error_message,
                )

                self._send_json_response(200, turn_resp.model_dump())

            except Exception as err:
                logger.error("Internal error processing turn: %s", type(err).__name__)
                self._send_error_json(500, "Internal error processing conversation turn", "INTERNAL_ERROR")

        def log_message(self, format: str, *args: Any) -> None:
            """Sanitize request logging to prevent leaking prompt text or tokens."""
            # Diagnostic only; never log query parameters or body content
            logger.debug("BrainServer [%s] %s", self.address_string(), format % args)

    return BrainHTTPRequestHandler


# ============================================================================
# Brain Server Core
# ============================================================================

class BrainServer:
    """Manages the background ThreadingHTTPServer serving the Brain API."""

    def __init__(
        self,
        orchestrator: Optional[BrainOrchestrator] = None,
        settings: Optional[BrainServerSettings] = None,
    ) -> None:
        self.settings = settings or BrainServerSettings()
        self.orchestrator = orchestrator or BrainOrchestrator()
        handler_cls = create_handler_class(self.orchestrator, self.settings)

        self._server = ThreadingHTTPServer(
            (self.settings.host, self.settings.port),
            handler_cls,
        )
        self._thread: Optional[threading.Thread] = None
        self._running = False

    @property
    def server_port(self) -> int:
        """Actual bound port (useful when port=0 was specified for dynamic binding)."""
        return self._server.server_port

    @property
    def server_url(self) -> str:
        """Complete local loopback base URL."""
        return f"http://{self.settings.host}:{self.server_port}"

    def start(self, daemon: bool = True) -> None:
        """Start the HTTP server on a background thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            daemon=daemon,
            name="StellaBrainServerThread",
        )
        self._thread.start()
        logger.info("Stella Brain HTTP API listening on %s (Loopback only)", self.server_url)

    def stop(self) -> None:
        """Stop the HTTP server and release port socket cleanly."""
        if not self._running:
            return
        self._running = False
        self._server.shutdown()
        self._server.server_close()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        logger.info("Stella Brain HTTP API stopped")

    def __enter__(self) -> "BrainServer":
        self.start()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.stop()


# ============================================================================
# CLI Entry Point
# ============================================================================

def run_server_cli() -> None:
    """Standalone CLI entry point for running the local brain server."""
    import argparse

    parser = argparse.ArgumentParser(description="Stella Brain Local HTTP API Server")
    parser.add_argument("--port", type=int, default=8000, help="Local port to bind (default: 8000)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Loopback host (default: 127.0.0.1)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    )

    settings = BrainServerSettings(host=args.host, port=args.port)
    server = BrainServer(settings=settings)
    server.start(daemon=False)

    print("=" * 65)
    print(f"Stella Brain Local HTTP API active on {server.server_url}")
    print("Press Ctrl+C to stop.")
    print("=" * 65)

    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nStopping Stella Brain API...")
        server.stop()
        print("Server stopped cleanly.")


if __name__ == "__main__":
    run_server_cli()
