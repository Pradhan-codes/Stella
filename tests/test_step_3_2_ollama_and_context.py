"""Unit and mocked tests for Stella Python Brain Step 3.2: Ollama Adapter & Context Manager.

Verifies:
1. Adapter data contracts (ChatMessage, LLMGenerationParams, LLMChunk, LLMResponse, LLMAdapterError).
2. Strict local loopback enforcement and redirect blocking on OllamaAdapter.
3. OllamaAdapter health checks, model verification, non-streaming generation, and streaming chunks.
4. Robust error mapping: ENGINE_OFFLINE, TIMEOUT, OUT_OF_VRAM, MODEL_NOT_FOUND, MALFORMED_RESPONSE.
5. Defense-in-depth logging (metadata only; never logging raw prompts, memories, or credentials).
6. Conservative TokenEstimator and its explicit heuristic limitations.
7. ContextManager budget enforcement: partition ceilings, non-negotiable retention of safety rules
   and current user message, FIFO eviction of older turns, and ContextOverflowError.
8. Personality configuration loading, schema validation, and system prompt generation.
9. End-to-end integration: validating mock Ollama JSON output against StructuredResponse contract.
"""

import io
import json
import logging
import socket
import urllib.error
import urllib.request
from pathlib import Path
import pytest
from pydantic import ValidationError

from brain.adapters.base import (
    ChatMessage,
    LLMAdapterError,
    LLMChunk,
    LLMGenerationParams,
    LLMResponse,
    Role,
)
from brain.adapters.ollama_adapter import OllamaAdapter
from brain.config.personality import (
    PersonalityConfig,
    build_system_prompt,
    load_personality_config,
)
from brain.config.settings import BrainSettings, ContextBudgetSettings
from brain.core.context import (
    AssembledContext,
    ContextManager,
    ContextOverflowError,
    TokenEstimator,
)
from brain.core.response_contract import StructuredResponse


# ============================================================================
# Helpers & Mock HTTP Transport
# ============================================================================

class MockHTTPResponse:
    """Mock urllib response object supporting read, readline, and iter protocol."""

    def __init__(self, body_bytes: bytes, status: int = 200, headers: dict = None):
        self._body = body_bytes
        self.status = status
        self.code = status
        self.headers = headers or {}
        self._stream = io.BytesIO(body_bytes)
        self.closed = False

    def read(self, amt: int = -1) -> bytes:
        return self._stream.read(amt)

    def readline(self) -> bytes:
        return self._stream.readline()

    def __iter__(self):
        return self

    def __next__(self) -> bytes:
        line = self._stream.readline()
        if not line:
            raise StopIteration
        return line

    def close(self):
        self.closed = True


# ============================================================================
# 1. Adapter Contract Tests
# ============================================================================

def test_chat_message_validation():
    """Verify ChatMessage fields, role validation, and extra field rejection."""
    msg = ChatMessage(role=Role.USER, content="Hello Stella!")
    assert msg.role == Role.USER
    assert msg.content == "Hello Stella!"
    assert msg.name is None

    # extra='forbid' must reject arbitrary fields
    with pytest.raises(ValidationError):
        ChatMessage(role=Role.USER, content="test", extra_field="forbidden")


def test_generation_params_validation_and_bounds():
    """Verify LLMGenerationParams defaults, constraints, and bounds."""
    params = LLMGenerationParams()
    assert params.temperature == 0.7
    assert params.top_p == 0.9
    assert params.max_tokens == 512
    assert params.format_json is True

    # Temperature out of bounds (> 2.0 or < 0.0)
    with pytest.raises(ValidationError):
        LLMGenerationParams(temperature=2.5)

    with pytest.raises(ValidationError):
        LLMGenerationParams(top_p=1.5)


def test_llm_chunk_prohibits_thought_delta():
    """Verify LLMChunk forbids unvalidated chain-of-thought fields."""
    chunk = LLMChunk(delta_text="Hello", finish_reason=None)
    assert chunk.delta_text == "Hello"

    with pytest.raises(ValidationError):
        # thought_delta is explicitly prohibited
        LLMChunk(delta_text="Hello", thought_delta="internal reasoning")


def test_llm_adapter_error_categorization():
    """Verify LLMAdapterError maintains typed categories and status codes."""
    err = LLMAdapterError(
        category="OUT_OF_VRAM",
        message="GPU memory exhausted",
        status_code=500,
    )
    assert err.category == "OUT_OF_VRAM"
    assert err.status_code == 500
    assert "[OUT_OF_VRAM]" in str(err)


# ============================================================================
# 2. Ollama Adapter Security & Loopback Enforcement Tests
# ============================================================================

def test_ollama_adapter_permits_loopback_destinations():
    """Verify literal loopback destinations are permitted."""
    for valid_url in [
        "http://127.0.0.1:11434",
        "http://localhost:11434",
        "http://[::1]:11434",
    ]:
        adapter = OllamaAdapter(base_url=valid_url)
        assert adapter.base_url.startswith("http://")


def test_ollama_adapter_rejects_remote_destinations():
    """Verify non-loopback or public destinations are strictly rejected."""
    for invalid_url in [
        "http://192.168.1.100:11434",
        "https://api.openai.com/v1",
        "http://ollama-remote.internal:11434",
        "http://10.0.0.5:11434",
        "ftp://127.0.0.1:11434",
    ]:
        with pytest.raises(ValueError, match="not a permitted local loopback destination|Invalid URL scheme"):
            OllamaAdapter(base_url=invalid_url)


# ============================================================================
# 3. Ollama Adapter Health Checks & Model Verification (Mocked)
# ============================================================================

def test_ollama_adapter_ping_success():
    """Verify ping returns True when Ollama /api/tags responds with HTTP 200."""
    def mock_transport(req, timeout):
        assert req.get_method() == "GET"
        assert req.full_url.endswith("/api/tags")
        return MockHTTPResponse(b'{"models": []}', status=200)

    adapter = OllamaAdapter(transport=mock_transport)
    assert adapter.ping() is True


def test_ollama_adapter_ping_failure():
    """Verify ping returns False when connection fails or times out."""
    def mock_transport(req, timeout):
        raise urllib.error.URLError(socket.timeout("timed out"))

    adapter = OllamaAdapter(transport=mock_transport)
    assert adapter.ping() is False


def test_ollama_adapter_check_model_available_true():
    """Verify check_model_available returns True when target model is present."""
    payload = {
        "models": [
            {"name": "huihui_ai/Hermes-3-Llama-3.2-abliterated:latest"},
            {"name": "qwen2.5:latest"},
        ]
    }
    def mock_transport(req, timeout):
        return MockHTTPResponse(json.dumps(payload).encode("utf-8"), status=200)

    adapter = OllamaAdapter(
        model_name="huihui_ai/Hermes-3-Llama-3.2-abliterated",
        transport=mock_transport,
    )
    assert adapter.check_model_available() is True


def test_ollama_adapter_check_model_available_false_missing():
    """Verify check_model_available returns False when model is missing; never downloads."""
    payload = {
        "models": [
            {"name": "llama3.1:latest"},
        ]
    }
    def mock_transport(req, timeout):
        return MockHTTPResponse(json.dumps(payload).encode("utf-8"), status=200)

    adapter = OllamaAdapter(
        model_name="huihui_ai/Hermes-3-Llama-3.2-abliterated",
        transport=mock_transport,
    )
    # Does NOT pull or download; returns False cleanly
    assert adapter.check_model_available() is False


# ============================================================================
# 4. Ollama Adapter Non-Streaming & Streaming Generation Tests
# ============================================================================

def test_ollama_adapter_generate_success():
    """Verify non-streaming generate properly formats request and parses response."""
    captured_request = {}

    response_payload = {
        "model": "huihui_ai/Hermes-3-Llama-3.2-abliterated",
        "created_at": "2026-10-19T12:00:00Z",
        "message": {
            "role": "assistant",
            "content": '{"user_facing_text": "Good evening, Darling! How can I help?"}',
        },
        "done": True,
        "prompt_eval_count": 85,
        "eval_count": 22,
    }

    def mock_transport(req, timeout):
        captured_request["url"] = req.full_url
        captured_request["method"] = req.get_method()
        captured_request["body"] = json.loads(req.data.decode("utf-8"))
        return MockHTTPResponse(json.dumps(response_payload).encode("utf-8"), status=200)

    adapter = OllamaAdapter(transport=mock_transport)
    messages = [
        ChatMessage(role=Role.SYSTEM, content="You are Stella."),
        ChatMessage(role=Role.USER, content="Hello!"),
    ]
    params = LLMGenerationParams(temperature=0.8, max_tokens=256, format_json=True)

    result = adapter.generate(messages, params)

    assert result.content == '{"user_facing_text": "Good evening, Darling! How can I help?"}'
    assert result.finish_reason == "stop"
    assert result.prompt_tokens == 85
    assert result.completion_tokens == 22
    assert result.total_duration_ms is not None

    # Verify request payload mapping
    assert captured_request["url"] == "http://127.0.0.1:11434/api/chat"
    assert captured_request["body"]["options"]["num_predict"] == 256
    assert captured_request["body"]["options"]["temperature"] == 0.8
    assert captured_request["body"]["format"] == "json"
    assert captured_request["body"]["stream"] is False
    assert len(captured_request["body"]["messages"]) == 2


def test_ollama_adapter_stream_chunks():
    """Verify streaming generation yields incremental LLMChunk objects and cleans up."""
    lines = [
        json.dumps({"message": {"content": "Hello"}, "done": False}).encode("utf-8") + b"\n",
        json.dumps({"message": {"content": " Master!"}, "done": False}).encode("utf-8") + b"\n",
        json.dumps({
            "message": {"content": ""},
            "done": True,
            "prompt_eval_count": 40,
            "eval_count": 5,
        }).encode("utf-8") + b"\n",
    ]
    mock_resp = MockHTTPResponse(b"".join(lines), status=200)

    def mock_transport(req, timeout):
        return mock_resp

    adapter = OllamaAdapter(transport=mock_transport)
    chunks = list(adapter.stream([ChatMessage(role=Role.USER, content="Hi")]))

    assert len(chunks) == 3
    assert chunks[0].delta_text == "Hello"
    assert chunks[0].finish_reason is None
    assert chunks[1].delta_text == " Master!"
    assert chunks[2].finish_reason == "stop"
    assert chunks[2].prompt_tokens == 40
    assert chunks[2].completion_tokens == 5

    # Verify socket response was closed in finally block
    assert mock_resp.closed is True


# ============================================================================
# 5. Robust Error Mapping Tests
# ============================================================================

def test_error_mapping_engine_offline():
    """Verify connection refused maps to ENGINE_OFFLINE."""
    def mock_transport(req, timeout):
        raise urllib.error.URLError(ConnectionRefusedError("actively refused 10061"))

    adapter = OllamaAdapter(transport=mock_transport)
    with pytest.raises(LLMAdapterError) as exc_info:
        adapter.generate([ChatMessage(role=Role.USER, content="ping")])
    assert exc_info.value.category == "ENGINE_OFFLINE"


def test_error_mapping_timeout():
    """Verify socket timeout maps to TIMEOUT."""
    def mock_transport(req, timeout):
        raise urllib.error.URLError(socket.timeout("The read operation timed out"))

    adapter = OllamaAdapter(transport=mock_transport)
    with pytest.raises(LLMAdapterError) as exc_info:
        adapter.generate([ChatMessage(role=Role.USER, content="ping")])
    assert exc_info.value.category == "TIMEOUT"


def test_error_mapping_out_of_vram():
    """Verify HTTP 500 with CUDA memory exhaustion maps to OUT_OF_VRAM."""
    def mock_transport(req, timeout):
        fp = io.BytesIO(b'{"error": "CUDA out of memory in model evaluation"}')
        raise urllib.error.HTTPError(
            url=req.full_url,
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=fp,
        )

    adapter = OllamaAdapter(transport=mock_transport)
    with pytest.raises(LLMAdapterError) as exc_info:
        adapter.generate([ChatMessage(role=Role.USER, content="ping")])
    assert exc_info.value.category == "OUT_OF_VRAM"


def test_error_mapping_model_not_found():
    """Verify HTTP 404 maps to MODEL_NOT_FOUND."""
    def mock_transport(req, timeout):
        fp = io.BytesIO(b'{"error": "model not found"}')
        raise urllib.error.HTTPError(
            url=req.full_url,
            code=404,
            msg="Not Found",
            hdrs={},
            fp=fp,
        )

    adapter = OllamaAdapter(transport=mock_transport)
    with pytest.raises(LLMAdapterError) as exc_info:
        adapter.generate([ChatMessage(role=Role.USER, content="ping")])
    assert exc_info.value.category == "MODEL_NOT_FOUND"


def test_error_mapping_malformed_json():
    """Verify non-JSON response maps to MALFORMED_RESPONSE."""
    def mock_transport(req, timeout):
        return MockHTTPResponse(b"<html>502 Bad Gateway</html>", status=200)

    adapter = OllamaAdapter(transport=mock_transport)
    with pytest.raises(LLMAdapterError) as exc_info:
        adapter.generate([ChatMessage(role=Role.USER, content="ping")])
    assert exc_info.value.category == "MALFORMED_RESPONSE"


# ============================================================================
# 6. Defense-in-Depth Logging Tests
# ============================================================================

def test_adapter_logs_never_leak_prompts_or_secrets(caplog):
    """Verify adapter logging records metadata only and never leaks prompts or secrets."""
    secret_prompt = "My password is SuperSecretPassword123 and sk-1234567890abcdef1234567890"

    response_payload = {
        "model": "huihui_ai/Hermes-3-Llama-3.2-abliterated",
        "message": {"role": "assistant", "content": "Acknowledged."},
        "done": True,
        "prompt_eval_count": 15,
        "eval_count": 3,
    }

    def mock_transport(req, timeout):
        return MockHTTPResponse(json.dumps(response_payload).encode("utf-8"), status=200)

    adapter = OllamaAdapter(transport=mock_transport)
    with caplog.at_level(logging.INFO, logger="stella.brain.adapters.ollama"):
        adapter.generate([ChatMessage(role=Role.USER, content=secret_prompt)])

    assert "Ollama chat turn completed in" in caplog.text
    assert "prompt_tokens=15" in caplog.text
    # Secret text must NEVER appear in the log output
    assert "SuperSecretPassword123" not in caplog.text
    assert "sk-1234567890abcdef1234567890" not in caplog.text


# ============================================================================
# 7. Token Estimator Tests
# ============================================================================

def test_token_estimator_calculations():
    """Verify heuristic calculations across text and messages with framing overhead."""
    estimator = TokenEstimator()

    assert estimator.estimate_text("") == 0

    # Short string: 10 chars -> ceil((10 / 3.8) * 1.1) = ceil(2.89) = 3
    short_tokens = estimator.estimate_text("Hello Yuki")
    assert short_tokens == 3

    # ChatMessage includes overhead: 3 + 4 = 7
    msg = ChatMessage(role=Role.USER, content="Hello Yuki")
    assert estimator.estimate_message(msg) == 7


# ============================================================================
# 8. Context Manager Budget Partitioning & Eviction Tests
# ============================================================================

def test_context_manager_normal_assembly():
    """Verify context manager assembles system, memory, perception, and conversation turns."""
    cm = ContextManager()

    system_instruction = "You are Stella, an intelligent companion."
    user_msg = "What is the telescope position?"
    memories = ["User prefers 45-degree angle", "Observation target is Vega"]
    perception = {"active_planet": "Saturn", "station": "Observatory-1"}
    history = [
        ChatMessage(role=Role.USER, content="Hello Stella!"),
        ChatMessage(role=Role.ASSISTANT, content="Hello Darling! The stars are aligned."),
    ]

    assembled = cm.assemble_context(
        system_instruction=system_instruction,
        current_user_message=user_msg,
        conversation_history=history,
        long_term_memories=memories,
        perceptual_state=perception,
    )

    assert isinstance(assembled, AssembledContext)
    assert len(assembled.messages) == 4  # system + 2 history + 1 user
    assert assembled.messages[0].role == Role.SYSTEM
    assert assembled.messages[-1].role == Role.USER
    assert assembled.messages[-1].content == user_msg

    # Verify memory and perception were embedded into system prompt
    sys_content = assembled.messages[0].content
    assert "Relevant Long-Term Memories:" in sys_content
    assert "User prefers 45-degree angle" in sys_content
    assert "Current Environment & Workspace State:" in sys_content
    assert "active_planet: Saturn" in sys_content

    # Completion reserve is preserved
    assert assembled.max_generation_tokens == cm.budget.completion_reserve_tokens
    assert assembled.eviction_summary.conversation_turns_dropped == 0


def test_context_manager_fifo_eviction_of_old_turns():
    """Verify older turns are evicted first (FIFO) when conversation exceeds history partition."""
    # Custom tight history budget: 40 tokens max for history
    budget = ContextBudgetSettings(
        total_context_limit=4096,
        short_term_conversation_tokens=200,
    )
    cm = ContextManager(budget_settings=budget)

    # Create 10 turns
    history = [
        ChatMessage(role=Role.USER, content=f"Long conversation question number {i} with additional detail")
        for i in range(10)
    ]

    assembled = cm.assemble_context(
        system_instruction="You are Stella.",
        current_user_message="Current short message",
        conversation_history=history,
    )

    # Some older turns must have been dropped
    assert assembled.eviction_summary.conversation_turns_dropped > 0
    # The newest turn in history must still be retained
    retained_contents = [m.content for m in assembled.messages]
    assert history[-1].content in retained_contents


def test_context_manager_pruning_memories():
    """Verify long-term memories are pruned if they exceed the memory partition ceiling."""
    # Tight memory budget of 50 tokens
    budget = ContextBudgetSettings(
        total_context_limit=4096,
        long_term_memory_tokens=50,
    )
    cm = ContextManager(budget_settings=budget)

    many_memories = [
        f"Detailed memory fact #{i}: User spent significant time working on astrophysics cataloging."
        for i in range(15)
    ]

    assembled = cm.assemble_context(
        system_instruction="You are Stella.",
        current_user_message="Hello",
        long_term_memories=many_memories,
    )

    assert assembled.eviction_summary.memories_pruned > 0
    # First memory is retained
    assert many_memories[0] in assembled.messages[0].content


def test_context_manager_overflow_raises_error():
    """Verify ContextOverflowError is raised when system prompt and user message alone exceed input budget."""
    # Very small total limit (512 tokens), completion reserve = 100, max input = 412
    budget = ContextBudgetSettings(
        total_context_limit=512,
        system_personality_tokens=100,
        long_term_memory_tokens=50,
        perceptual_state_tokens=50,
        short_term_conversation_tokens=200,
        completion_reserve_tokens=112,
    )
    cm = ContextManager(budget_settings=budget)

    # Huge user message that alone exceeds 400 tokens (~1600 characters)
    huge_user_msg = "A" * 2000

    with pytest.raises(ContextOverflowError, match="Context overflow"):
        cm.assemble_context(
            system_instruction="Short system prompt.",
            current_user_message=huge_user_msg,
        )


# ============================================================================
# 9. Personality Configuration & Prompt Builder Tests
# ============================================================================

def test_load_default_personality_config():
    """Verify default personality.json loads and adheres to PersonalityConfig schema."""
    config = load_personality_config()

    assert config.name == "Stella"
    assert config.version == "1.0.0"
    assert len(config.traits) > 0
    assert "warm" in config.persona_summary.lower()
    assert "neutral" in config.conversational_style.expression_hints
    assert "happy" in config.conversational_style.expression_hints
    assert len(config.memory_honesty.policy) > 10
    assert len(config.safety_and_boundaries.ethical_guardrails) > 10


def test_build_system_prompt():
    """Verify build_system_prompt constructs structured instructions containing all sections."""
    prompt = build_system_prompt()

    assert "You are Stella" in prompt
    assert "Core Traits:" in prompt
    assert "Conversational Style:" in prompt
    assert "Memory & Honesty:" in prompt
    assert "Safety & Authority Boundaries:" in prompt
    assert "Operating Instructions:" in prompt


def test_personality_config_missing_file_raises():
    """Verify attempting to load a non-existent personality file raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        load_personality_config("c:/non/existent/personality.json")


# ============================================================================
# 10. End-to-End Structured Response Integration Test
# ============================================================================

def test_end_to_end_mock_ollama_structured_response():
    """Verify mock Ollama JSON generation validates cleanly into StructuredResponse contract."""
    mock_json = {
        "user_facing_text": "I checked our orbital trajectory. Everything looks serene!",
        "proposed_actions": [
            {
                "proposal_id": "11111111-2222-3333-4444-555555555555",
                "action_name": "workspace_query",
                "parameters": {"scope": "observatory"},
                "intent_summary": "Check observatory telemetry",
                "risk_level": "read_only",
            }
        ],
        "confirmation_requirements": [],
        "expression_hint": "happy",
    }

    ollama_api_response = {
        "model": "huihui_ai/Hermes-3-Llama-3.2-abliterated",
        "message": {
            "role": "assistant",
            "content": json.dumps(mock_json),
        },
        "done": True,
        "prompt_eval_count": 120,
        "eval_count": 45,
    }

    def mock_transport(req, timeout):
        return MockHTTPResponse(json.dumps(ollama_api_response).encode("utf-8"), status=200)

    adapter = OllamaAdapter(transport=mock_transport)
    cm = ContextManager()

    system_prompt = build_system_prompt()
    assembled = cm.assemble_context(
        system_instruction=system_prompt,
        current_user_message="How are our systems looking, Stella?",
    )

    llm_resp = adapter.generate(assembled.messages)
    structured = StructuredResponse.model_validate_json(llm_resp.content)

    assert "orbital trajectory" in structured.user_facing_text
    assert structured.expression_hint == "happy"
    assert len(structured.proposed_actions) == 1
    assert structured.proposed_actions[0].action_name == "workspace_query"
    assert structured.proposed_actions[0].risk_level == "read_only"
