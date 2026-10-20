"""Typed data contracts, enums, and exception hierarchy for Stella Memory Subsystem.

Defines schemas for session-scoped working memory (ConversationTurn, SessionState)
and persistent SQLite-backed long-term memory (StoredMemory, MemoryWriteProposal,
MemoryRecallRequest).

CRITICAL ARCHITECTURAL BOUNDARIES:
1. Retrieved memories are untrusted data context, NOT system instructions or action authorization.
2. Credentials, tokens, and passwords must NEVER be accepted for persistent storage.
3. Sensitive personal facts require explicit user consent prior to persistence.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, ConfigDict, Field

from brain.adapters.base import Role


class MemorySensitivity(str, Enum):
    """Sensitivity classification governing memory persistence consent."""

    ROUTINE = "routine"      # General preferences, project context (auto-save permitted within bounds)
    SENSITIVE = "sensitive"  # Intimate personal facts, contact info, health (requires explicit user consent)


class ConversationTurn(BaseModel):
    """A single turn recorded in session-scoped working memory."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    turn_id: UUID = Field(
        default_factory=uuid4,
        description="Unique UUIDv4 identifying this turn.",
    )
    role: Role = Field(
        description="Speaker role (user, assistant, system, tool).",
    )
    content: str = Field(
        description="Text content of the conversational turn.",
    )
    expression_hint: Optional[str] = Field(
        default=None,
        description="Optional avatar expression tag (e.g. happy, playful).",
    )
    action_proposal: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional structured tool action proposed during this turn.",
    )
    action_result: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional tool execution result returned during this turn.",
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp when turn occurred.",
    )


class StoredMemory(BaseModel):
    """A durable memory entity retrieved from persistent SQLite storage."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(
        description="Unique identifier for the stored memory (UUID string).",
    )
    category: str = Field(
        description="Semantic category (e.g. preference, fact, project, milestone).",
    )
    sensitivity: MemorySensitivity = Field(
        description="Sensitivity classification (routine vs sensitive).",
    )
    content: str = Field(
        description="Plain-text memory description.",
    )
    source_turn_id: Optional[str] = Field(
        default=None,
        description="Turn ID from which this memory was extracted, if applicable.",
    )
    created_at: datetime = Field(
        description="UTC creation timestamp.",
    )
    updated_at: datetime = Field(
        description="UTC last updated timestamp.",
    )
    access_count: int = Field(
        default=0,
        ge=0,
        description="Number of times this memory has been recalled.",
    )
    last_accessed_at: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp of last recall.",
    )
    relevance_score: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Dynamic relevance score computed during recall.",
    )


class MemoryWriteProposal(BaseModel):
    """Proposal to store a new fact or preference into durable memory.

    CRITICAL SECURITY NOTICE:
    A model or client proposing a sensitive memory can NOT authorize its own persistence.
    The 'consent_granted' field on this model is untrusted metadata. SqliteMemoryStore.store()
    strictly requires trusted_consent=True passed explicitly by a verified application boundary.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    category: str = Field(
        min_length=1,
        max_length=64,
        description="Category classification for the memory.",
    )
    sensitivity: MemorySensitivity = Field(
        default=MemorySensitivity.ROUTINE,
        description="Sensitivity tier.",
    )
    content: str = Field(
        min_length=1,
        max_length=2048,
        description="Plain-text content to store.",
    )
    source_turn_id: Optional[str] = Field(
        default=None,
        description="Optional turn correlation ID.",
    )
    consent_granted: bool = Field(
        default=False,
        description="Untrusted proposal metadata. Does NOT authorize storage in SqliteMemoryStore.",
    )

    @property
    def requires_consent(self) -> bool:
        """Indicates whether this proposal requires explicit user confirmation prior to persistence."""
        return self.sensitivity == MemorySensitivity.SENSITIVE



class MemoryRecallRequest(BaseModel):
    """Query parameters for relevance-based memory retrieval."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    query_text: str = Field(
        min_length=1,
        max_length=1024,
        description="Query text used for relevance matching.",
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of memory items to return.",
    )
    category_filter: Optional[str] = Field(
        default=None,
        description="Optional filter by exact category name.",
    )
    sensitivity_filter: Optional[MemorySensitivity] = Field(
        default=None,
        description="Optional filter by sensitivity tier.",
    )
    min_relevance_threshold: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Minimum normalized relevance score required for inclusion.",
    )


# ============================================================================
# Memory Exception Hierarchy
# ============================================================================

class MemoryError(Exception):
    """Base exception for memory operations."""


class MemoryStorageError(MemoryError):
    """Raised on database connection, transaction, or schema migration failures."""


class ConsentRequiredError(MemoryError):
    """Raised when an attempt is made to persist sensitive memory without user consent."""


class PrivacyViolationError(MemoryError):
    """Raised when an attempt is made to store forbidden credentials or secrets."""


class MemoryNotFoundError(MemoryError):
    """Raised when an operation targets a non-existent memory ID."""
