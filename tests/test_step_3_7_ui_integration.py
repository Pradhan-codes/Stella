"""Regression test suite for Stella Phase 3 — Step 3.7: UI–Brain Integration.

Verifies:
1. Loopback-only binding enforcement (rejects external network interfaces).
2. Health check endpoint (GET /api/health and GET /health).
3. Valid turn requests over local HTTP API with typed JSON response.
4. Session isolation and continuity across multiple HTTP requests.
5. CORS origin restriction and preflight (OPTIONS) validation.
6. Unauthorized origin rejection (HTTP 403 Forbidden).
7. Payload size limits (HTTP 413 Payload Too Large).
8. Malformed JSON, empty payload, and invalid schema handling (HTTP 400 Bad Request).
9. Malicious or invalid session ID validation.
10. Safe error handling without stack trace or token leaks.
11. Untrusted model output & zero automatic action execution over API.
12. Zero confirmation token leakage in API responses.
"""

import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional
import pytest

from brain.core.orchestrator import BrainOrchestrator, OrchestratorTurnStatus
from brain.service.server import (
    BrainServer,
    BrainServerSettings,
    DEFAULT_ALLOWED_ORIGINS,
    HealthResponsePayload,
    TurnRequestPayload,
    TurnResponsePayload,
)
from tests.test_step_3_6_orchestrator import FakeLLMAdapter


@pytest.fixture
def fake_adapter() -> FakeLLMAdapter:
    """Configurable fake LLM adapter."""
    return FakeLLMAdapter(
        canned_response=json.dumps({
            "response": "Hello from Stella Brain over HTTP!",
            "expression_hint": "happy",
            "proposed_actions": [],
        })
    )


@pytest.fixture
def orchestrator(fake_adapter: FakeLLMAdapter) -> BrainOrchestrator:
    """Orchestrator backed by fake adapter."""
    return BrainOrchestrator(llm_adapter=fake_adapter)


@pytest.fixture
def running_server(orchestrator: BrainOrchestrator):
    """Context-managed BrainServer bound to a dynamic loopback port."""
    settings = BrainServerSettings(port=0, max_payload_bytes=8192)
    server = BrainServer(orchestrator=orchestrator, settings=settings)
    server.start(daemon=True)
    try:
        yield server
    finally:
        server.stop()


def _make_http_request(
    url: str,
    method: str = "GET",
    data: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    raw_body: Optional[bytes] = None,
) -> tuple[int, Dict[str, Any], Dict[str, str]]:
    """Helper executing HTTP request and returning (status_code, parsed_json, response_headers)."""
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)

    body_bytes = None
    if raw_body is not None:
        body_bytes = raw_body
    elif data is not None:
        body_bytes = json.dumps(data).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body_bytes, headers=req_headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            resp_bytes = resp.read()
            resp_headers = dict(resp.headers)
            parsed_data = json.loads(resp_bytes.decode("utf-8")) if resp_bytes else {}
            return resp.status, parsed_data, resp_headers
    except urllib.error.HTTPError as err:
        err_bytes = err.read()
        err_headers = dict(err.headers)
        err_data = json.loads(err_bytes.decode("utf-8")) if err_bytes else {}
        return err.code, err_data, err_headers


# ============================================================================
# 1. Loopback Binding & Settings Security
# ============================================================================

def test_server_binds_to_loopback_only() -> None:
    """Verify that attempting to bind to public or wildcard network interfaces is rejected."""
    # Permitted loopback bindings
    assert BrainServerSettings(host="127.0.0.1").host == "127.0.0.1"
    assert BrainServerSettings(host="localhost").host == "localhost"

    # Strictly forbidden public / wildcard addresses
    for invalid_host in ("0.0.0.0", "192.168.1.10", "10.0.0.1", "stella.internal", "example.com"):
        with pytest.raises(ValueError, match="not a local loopback address"):
            BrainServerSettings(host=invalid_host)


# ============================================================================
# 2. Health Check Endpoint
# ============================================================================

def test_health_endpoint(running_server: BrainServer) -> None:
    """Verify GET /api/health and GET /health return valid status and engine metadata."""
    for path in ("/api/health", "/health"):
        status, data, headers = _make_http_request(f"{running_server.server_url}{path}")
        assert status == 200
        assert data["status"] == "ok"
        assert "fsm_state" in data
        assert "model" in data
        assert "version" in data
        # Validate against Pydantic schema
        HealthResponsePayload.model_validate(data)


# ============================================================================
# 3. Valid Conversational Turn
# ============================================================================

def test_valid_turn_request_with_fake_adapter(running_server: BrainServer) -> None:
    """Verify POST /api/turn successfully processes a message and returns typed response."""
    status, data, headers = _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": "Hello Stella, is the sky clear tonight?"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert status == 200
    assert data["status"] == "success"
    assert data["user_facing_text"] == "Hello from Stella Brain over HTTP!"
    assert data["expression_hint"] == "happy"
    assert "turn_id" in data
    assert "session_id" in data
    assert data["proposed_actions"] == []
    assert data["confirmation_prompts"] == []

    # Validate against Pydantic schema
    validated = TurnResponsePayload.model_validate(data)
    assert validated.status == "success"


# ============================================================================
# 4. Session Continuity & Isolation
# ============================================================================

def test_session_id_persistence_and_isolation_over_http(
    running_server: BrainServer,
    fake_adapter: FakeLLMAdapter,
) -> None:
    """Verify that multiple turns in the same session accumulate history while other sessions remain isolated."""
    session_alpha = "session_alpha_123"
    session_beta = "session_beta_456"

    # Turn 1 in Session Alpha
    fake_adapter.canned_response = json.dumps({"response": "Alpha Turn 1"})
    _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": "Alpha message 1", "session_id": session_alpha},
        headers={"Origin": "http://localhost:5173"},
    )

    # Turn 2 in Session Alpha
    fake_adapter.canned_response = json.dumps({"response": "Alpha Turn 2"})
    _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": "Alpha message 2", "session_id": session_alpha},
        headers={"Origin": "http://localhost:5173"},
    )

    # Turn 1 in Session Beta
    fake_adapter.canned_response = json.dumps({"response": "Beta Turn 1"})
    _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": "Beta message 1", "session_id": session_beta},
        headers={"Origin": "http://localhost:5173"},
    )

    # Inspect internal orchestrator stores for each session
    store_alpha = running_server.orchestrator.get_session_store(session_alpha)
    store_beta = running_server.orchestrator.get_session_store(session_beta)

    # Session Alpha has 4 turns (2 user, 2 assistant)
    assert store_alpha.turn_count == 4
    # Session Beta has 2 turns (1 user, 1 assistant)
    assert store_beta.turn_count == 2


# ============================================================================
# 5. CORS & Origin Enforcement
# ============================================================================

def test_cors_preflight_and_allowed_origins(running_server: BrainServer) -> None:
    """Verify OPTIONS preflight returns appropriate CORS headers for permitted origins."""
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        req = urllib.request.Request(
            f"{running_server.server_url}/api/turn",
            headers={"Origin": origin},
            method="OPTIONS",
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 204
            assert resp.headers.get("Access-Control-Allow-Origin") == origin
            assert "POST" in resp.headers.get("Access-Control-Allow-Methods", "")


def test_unauthorized_origin_rejected(running_server: BrainServer) -> None:
    """Verify requests originating from unauthorized external origins are rejected with 403."""
    status, data, _ = _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": "Cross-site request attack"},
        headers={"Origin": "http://attacker-controlled-site.com"},
    )
    assert status == 403
    assert data["code"] == "UNAUTHORIZED_ORIGIN"


# ============================================================================
# 6. Payload Bounds & Input Validation
# ============================================================================

def test_oversized_payload_rejected(running_server: BrainServer) -> None:
    """Verify payloads exceeding max_payload_bytes return 413 Payload Too Large."""
    # Server fixture has max_payload_bytes=8192
    huge_message = "x" * 9000
    status, data, _ = _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": huge_message},
        headers={"Origin": "http://localhost:5173"},
    )
    assert status == 413
    assert data["code"] == "PAYLOAD_TOO_LARGE"


def test_malformed_json_payload_rejected(running_server: BrainServer) -> None:
    """Verify invalid JSON returns 400 Bad Request with sanitized message."""
    broken_json = b'{"user_message": "broken string without closing quote'
    status, data, _ = _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        raw_body=broken_json,
        headers={"Origin": "http://localhost:5173", "Content-Type": "application/json"},
    )
    assert status == 400
    assert data["code"] == "VALIDATION_ERROR"


def test_empty_payload_rejected(running_server: BrainServer) -> None:
    """Verify empty request body returns 400 Bad Request."""
    status, data, _ = _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        raw_body=b"",
        headers={"Origin": "http://localhost:5173", "Content-Type": "application/json", "Content-Length": "0"},
    )
    assert status == 400
    assert data["code"] == "EMPTY_PAYLOAD"


def test_invalid_session_id_characters_rejected(running_server: BrainServer) -> None:
    """Verify session IDs containing path traversal or injection characters are rejected."""
    for bad_id in ("../../etc/passwd", "session;DROP TABLE", "id with spaces", "session<script>"):
        status, data, _ = _make_http_request(
            f"{running_server.server_url}/api/turn",
            method="POST",
            data={"user_message": "Test message", "session_id": bad_id},
            headers={"Origin": "http://localhost:5173"},
        )
        assert status == 400
        assert data["code"] == "VALIDATION_ERROR"


def test_missing_endpoint_returns_404(running_server: BrainServer) -> None:
    """Verify unmapped URLs return 404 Not Found."""
    status, data, _ = _make_http_request(f"{running_server.server_url}/unmapped_path")
    assert status == 404
    assert data["code"] == "NOT_FOUND"


# ============================================================================
# 7. Security Boundaries: No Tool Execution & No Token Leakage
# ============================================================================

def test_proposed_actions_not_executed_over_http(
    running_server: BrainServer,
    fake_adapter: FakeLLMAdapter,
) -> None:
    """Verify that action proposals are returned as untrusted data and never executed automatically."""
    fake_adapter.canned_response = json.dumps({
        "response": "I can probe the observatory status for you.",
        "proposed_actions": [
            {
                "proposal_id": "11111111-2222-3333-4444-555555555555",
                "action_name": "get_observatory_status",
                "parameters": {},
                "intent_summary": "Probe telescope status",
                "risk_level": "read_only",
            }
        ],
    })

    status, data, _ = _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": "Check status"},
        headers={"Origin": "http://localhost:5173"},
    )

    assert status == 200
    assert len(data["proposed_actions"]) == 1
    proposal = data["proposed_actions"][0]
    assert proposal["action_name"] == "get_observatory_status"
    assert proposal["risk_level"] == "read_only"

    # Crucial security invariant: The action proposal was evaluated, but NOT executed
    assert "execution_result" not in proposal
    assert "output_data" not in proposal


def test_confirmation_tokens_not_exposed_over_http(
    running_server: BrainServer,
    fake_adapter: FakeLLMAdapter,
) -> None:
    """Verify confirmation tokens are never serialized or leaked over the HTTP API."""
    fake_adapter.canned_response = json.dumps({
        "response": "Recalibrating the mount requires your explicit confirmation.",
        "proposed_actions": [
            {
                "proposal_id": "22222222-3333-4444-5555-666666666666",
                "action_name": "recalibrate_sensor_mount",
                "parameters": {"sensor_id": "mount_alpha", "axis": "both"},
                "intent_summary": "Align optical mount",
                "risk_level": "consequential",
            }
        ],
    })

    status, data, _ = _make_http_request(
        f"{running_server.server_url}/api/turn",
        method="POST",
        data={"user_message": "Recalibrate the sensor mount"},
        headers={"Origin": "http://localhost:5173"},
    )

    assert status == 200
    assert data["status"] == "awaiting_confirmation"
    assert len(data["confirmation_prompts"]) == 1
    prompt = data["confirmation_prompts"][0]
    assert prompt["action_name"] == "recalibrate_sensor_mount"
    assert prompt["risk_level"] == "consequential"

    # Crucial security invariant: Confirmation tokens are never exposed in prompt summary
    assert "confirmation_token" not in prompt
    assert "token" not in prompt
