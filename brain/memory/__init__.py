"""Memory subsystem for Stella Python Brain.

Provides session-scoped working memory (SessionMemoryStore) and durable,
SQLite-backed persistent memory (SqliteMemoryStore) with privacy guardrails,
credential exclusion, and relevance-based retrieval.
"""

from brain.memory.long_term import SqliteMemoryStore, format_for_context
from brain.memory.schema import (
    ConsentRequiredError,
    ConversationTurn,
    MemoryError,
    MemoryNotFoundError,
    MemoryRecallRequest,
    MemorySensitivity,
    MemoryStorageError,
    MemoryWriteProposal,
    PrivacyViolationError,
    StoredMemory,
)
from brain.memory.short_term import SessionMemoryStore

__all__ = [
    # Data Contracts
    "MemorySensitivity",
    "ConversationTurn",
    "StoredMemory",
    "MemoryWriteProposal",
    "MemoryRecallRequest",
    # Stores
    "SessionMemoryStore",
    "SqliteMemoryStore",
    # Integration Helpers
    "format_for_context",
    # Exceptions
    "MemoryError",
    "MemoryStorageError",
    "ConsentRequiredError",
    "PrivacyViolationError",
    "MemoryNotFoundError",
]
