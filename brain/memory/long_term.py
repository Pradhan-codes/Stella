"""SQLite-backed Long-Term Memory repository for Stella Python Brain.

Provides local, persistent storage for user preferences, project facts, and
explicitly permitted sensitive context. Enforces strict privacy boundaries,
credential rejection, and explicit consent for sensitive memories.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. Local-Only Storage: Local SQLite database only (stella_memory.db). No cloud sync,
   remote telemetry, or external vector services.
2. Absolute Credential Exclusion: Passwords, API keys, tokens, and credentials are
   strictly rejected with PrivacyViolationError.
3. Consent Enforcement: Sensitive personal memories require explicit user consent
   (consent_granted=True).
4. Untrusted Context: Memories are data context only; they cannot authorize actions
   or override system policies.
5. Parameterized SQL: All database queries use strict parameterized queries (?).
"""

import logging
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from uuid import uuid4

from brain.config.logging import REDACTION_PATTERNS
from brain.config.settings import BrainSettings
from brain.memory.schema import (
    ConsentRequiredError,
    MemoryNotFoundError,
    MemoryRecallRequest,
    MemorySensitivity,
    MemoryStorageError,
    MemoryWriteProposal,
    PrivacyViolationError,
    StoredMemory,
)

logger = logging.getLogger("stella.brain.memory")

CURRENT_SCHEMA_VERSION = 1

COMMON_STOP_WORDS: Set[str] = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
    "did", "do", "does", "doing", "don't", "down", "during", "each", "few", "for",
    "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers",
    "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it",
    "its", "itself", "me", "more", "most", "my", "myself", "no", "nor", "not", "of",
    "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
    "out", "over", "own", "same", "she", "should", "so", "some", "such", "than",
    "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these",
    "they", "this", "those", "through", "to", "too", "under", "until", "up", "very",
    "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
    "why", "with", "would", "you", "your", "yours", "yourself", "yourselves",
}


def _verify_no_credentials(text: str) -> None:
    """Verify that text does not contain recognized credentials, tokens, or keys.

    DEFENSE-IN-DEPTH LIMITATION NOTICE:
    Pattern detection is a heuristic defense-in-depth measure against accidental
    token/key leakage. Regex cannot mathematically detect every secret, novel token format,
    or unstructured private disclosure. Application boundaries must never submit raw
    credentials or sensitive keys to memory.

    Raises:
        PrivacyViolationError: If a credential or secret pattern is detected.
    """
    for pattern in REDACTION_PATTERNS:
        if pattern.search(text):
            raise PrivacyViolationError(
                "Refusing to store credential, token, or password in long-term memory."
            )



class SqliteMemoryStore:
    """Persistent SQLite repository for Stella durable memories."""

    def __init__(self, db_path: Optional[Union[str, Path]] = None):
        """Initialize the SQLite memory store and execute migrations.

        Args:
            db_path: Path to the SQLite database file, or ':memory:'.
                     If None, defaults to settings.data_dir / 'stella_memory.db'.
        """
        if db_path is None:
            settings = BrainSettings()
            db_dir = Path(settings.data_dir)
            db_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = str(db_dir / "stella_memory.db")
        else:
            self.db_path = str(db_path)
            if self.db_path != ":memory:":
                Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        self._conn = sqlite3.connect(self.db_path)
        self._conn.row_factory = sqlite3.Row
        self._configure_database()
        self._initialize_schema()

    def _configure_database(self) -> None:
        """Apply safe operational pragmas."""
        cur = self._conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON;")
        cur.execute("PRAGMA busy_timeout = 5000;")
        if self.db_path != ":memory:":
            cur.execute("PRAGMA journal_mode = WAL;")

    def _initialize_schema(self) -> None:
        """Validate and apply database schema and migrations."""
        with self._conn:
            # 1. Version table
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );
                """
            )

            row = self._conn.execute(
                "SELECT MAX(version) AS current_ver FROM schema_version;"
            ).fetchone()
            current_ver = row["current_ver"] if row and row["current_ver"] is not None else 0

            if current_ver > CURRENT_SCHEMA_VERSION:
                raise MemoryStorageError(
                    f"Database schema version {current_ver} is newer than supported version {CURRENT_SCHEMA_VERSION}."
                )

            if current_ver < 1:
                # 2. Main memories table
                self._conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS memories (
                        id TEXT PRIMARY KEY,
                        category TEXT NOT NULL,
                        sensitivity TEXT NOT NULL CHECK(sensitivity IN ('routine', 'sensitive')),
                        content TEXT NOT NULL,
                        source_turn_id TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        access_count INTEGER NOT NULL DEFAULT 0,
                        last_accessed_at TEXT
                    );
                    """
                )

                # 3. Secondary indices
                self._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);"
                )
                self._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_memories_sensitivity ON memories(sensitivity);"
                )
                self._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);"
                )

                # 4. FTS5 full-text search table with automatic sync triggers
                try:
                    self._conn.execute(
                        """
                        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                            content,
                            category,
                            content='memories',
                            content_rowid='rowid'
                        );
                        """
                    )
                    self._conn.execute(
                        """
                        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
                            INSERT INTO memories_fts(rowid, content, category)
                            VALUES (new.rowid, new.content, new.category);
                        END;
                        """
                    )
                    self._conn.execute(
                        """
                        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
                            INSERT INTO memories_fts(memories_fts, rowid, content, category)
                            VALUES ('delete', old.rowid, old.content, old.category);
                        END;
                        """
                    )
                    self._conn.execute(
                        """
                        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
                            INSERT INTO memories_fts(memories_fts, rowid, content, category)
                            VALUES ('delete', old.rowid, old.content, old.category);
                            INSERT INTO memories_fts(rowid, content, category)
                            VALUES (new.rowid, new.content, new.category);
                        END;
                        """
                    )
                except sqlite3.OperationalError:
                    # FTS5 virtual table optional fallback
                    logger.warning("FTS5 table creation skipped; keyword search fallback active.")

                # Record version 1 application
                now_str = datetime.now(timezone.utc).isoformat()
                self._conn.execute(
                    "INSERT INTO schema_version (version, applied_at) VALUES (1, ?);",
                    (now_str,),
                )

    def close(self) -> None:
        """Close SQLite database connection cleanly."""
        if self._conn:
            self._conn.close()

    def __enter__(self) -> "SqliteMemoryStore":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    # ------------------------------------------------------------------------
    # CRUD Operations
    # ------------------------------------------------------------------------

    def store(
        self,
        proposal: MemoryWriteProposal,
        *,
        trusted_consent: bool = False,
    ) -> StoredMemory:
        """Persist a new memory entry.

        CRITICAL SECURITY & CONSENT ARCHITECTURE:
        1. Sensitive memories (sensitivity='sensitive') require explicit user consent
           verified by a trusted application boundary (trusted_consent=True).
        2. Any proposal-level flags (e.g. proposal.consent_granted=True) are strictly
           untrusted model/request metadata and NEVER count as verified consent.
        3. If trusted_consent is False for a sensitive memory, store() FAILS CLOSED
           with ConsentRequiredError.
        4. Routine memories (sensitivity='routine') are stored under the selective-memory
           policy without requiring explicit confirmation.

        Args:
            proposal: MemoryWriteProposal specifying category, sensitivity, and content.
            trusted_consent: Explicit keyword-only flag from trusted confirmation gateway.
                            Defaults to False (fail-closed).

        Returns:
            StoredMemory instance representing the persisted record.

        Raises:
            PrivacyViolationError: If content contains credentials, tokens, or passwords.
            ConsentRequiredError: If sensitivity is sensitive and trusted_consent is False.
            MemoryStorageError: On SQLite failure.
        """
        # Guard 1: Absolute credential exclusion
        _verify_no_credentials(proposal.content)

        # Guard 2: Explicit consent required for sensitive items from a TRUSTED boundary
        if proposal.sensitivity == MemorySensitivity.SENSITIVE:
            if not trusted_consent:
                raise ConsentRequiredError(
                    "Sensitive memory persistence requires explicit user consent verified by a "
                    "trusted application boundary. Model-proposed flags (e.g. proposal.consent_granted) "
                    "are untrusted metadata and cannot authorize persistence."
                )


        memory_id = str(uuid4())
        now_dt = datetime.now(timezone.utc)
        now_str = now_dt.isoformat()

        try:
            with self._conn:
                self._conn.execute(
                    """
                    INSERT INTO memories (
                        id, category, sensitivity, content, source_turn_id,
                        created_at, updated_at, access_count, last_accessed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL);
                    """,
                    (
                        memory_id,
                        proposal.category.strip().lower(),
                        proposal.sensitivity.value,
                        proposal.content.strip(),
                        proposal.source_turn_id,
                        now_str,
                        now_str,
                    ),
                )
            logger.info("Persisted memory [%s] in category '%s'", memory_id, proposal.category)
            return StoredMemory(
                id=memory_id,
                category=proposal.category.strip().lower(),
                sensitivity=proposal.sensitivity,
                content=proposal.content.strip(),
                source_turn_id=proposal.source_turn_id,
                created_at=now_dt,
                updated_at=now_dt,
                access_count=0,
                last_accessed_at=None,
            )
        except sqlite3.Error as err:
            raise MemoryStorageError(f"Failed to persist memory: {type(err).__name__}")

    def get(self, memory_id: str) -> Optional[StoredMemory]:
        """Fetch a single memory by ID.

        Args:
            memory_id: Memory UUID string.

        Returns:
            StoredMemory if found, None otherwise.
        """
        cur = self._conn.cursor()
        cur.execute(
            """
            SELECT id, category, sensitivity, content, source_turn_id,
                   created_at, updated_at, access_count, last_accessed_at
            FROM memories WHERE id = ?;
            """,
            (memory_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return self._row_to_stored_memory(row)

    def list(
        self,
        category: Optional[str] = None,
        sensitivity: Optional[MemorySensitivity] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[StoredMemory]:
        """List stored memories with optional filtering and pagination.

        Args:
            category: Optional category filter.
            sensitivity: Optional sensitivity filter.
            limit: Maximum items to return (1..200).
            offset: Pagination offset.

        Returns:
            List of StoredMemory instances ordered by created_at DESC.
        """
        limit = max(1, min(limit, 200))
        offset = max(0, offset)

        query = """
            SELECT id, category, sensitivity, content, source_turn_id,
                   created_at, updated_at, access_count, last_accessed_at
            FROM memories
        """
        conditions = []
        params: List[Any] = []

        if category:
            conditions.append("category = ?")
            params.append(category.strip().lower())
        if sensitivity:
            conditions.append("sensitivity = ?")
            params.append(sensitivity.value)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?;"
        params.extend([limit, offset])

        cur = self._conn.cursor()
        cur.execute(query, params)
        rows = cur.fetchall()
        return [self._row_to_stored_memory(r) for r in rows]

    def correct(
        self,
        memory_id: str,
        new_content: str,
        new_category: Optional[str] = None,
    ) -> StoredMemory:
        """Update/correct an existing memory entry.

        Args:
            memory_id: UUID string of memory to correct.
            new_content: Updated memory text.
            new_category: Optional updated category.

        Returns:
            Updated StoredMemory instance.

        Raises:
            MemoryNotFoundError: If memory_id does not exist.
            PrivacyViolationError: If new_content contains forbidden credentials.
            MemoryStorageError: On SQLite failure.
        """
        _verify_no_credentials(new_content)

        existing = self.get(memory_id)
        if not existing:
            raise MemoryNotFoundError(f"Memory with ID '{memory_id}' not found.")

        cat = (new_category.strip().lower() if new_category else existing.category)
        now_dt = datetime.now(timezone.utc)
        now_str = now_dt.isoformat()

        try:
            with self._conn:
                self._conn.execute(
                    """
                    UPDATE memories
                    SET content = ?, category = ?, updated_at = ?
                    WHERE id = ?;
                    """,
                    (new_content.strip(), cat, now_str, memory_id),
                )
            logger.info("Updated memory [%s]", memory_id)
            return self.get(memory_id)  # type: ignore[return-value]
        except sqlite3.Error as err:
            raise MemoryStorageError(f"Failed to update memory: {type(err).__name__}")

    def delete(self, memory_id: str) -> bool:
        """Delete a single memory by ID.

        CRITICAL PRIVACY & FORENSIC LIMITATION NOTICE:
        Deletion removes the record logically from the application database table
        and purges it from the FTS5 search index. It does NOT perform cryptographic
        or forensic zeroization of raw disk blocks, operating system page caches,
        SQLite write-ahead log (WAL) files, or pre-existing backups.

        Returns:
            True if memory was deleted, False if ID was not found.
        """
        try:
            with self._conn:
                cur = self._conn.execute(
                    "DELETE FROM memories WHERE id = ?;",
                    (memory_id,),
                )
                deleted = cur.rowcount > 0
            if deleted:
                logger.info("Deleted memory [%s]", memory_id)
            return deleted
        except sqlite3.Error as err:
            raise MemoryStorageError(f"Failed to delete memory: {type(err).__name__}")

    def delete_by_category(self, category: str) -> int:
        """Delete all memories in a given category.

        CRITICAL PRIVACY & FORENSIC LIMITATION NOTICE:
        Deletion removes matching records logically from application tables and
        purges them from the FTS5 search index. It does NOT perform cryptographic
        or forensic zeroization of raw disk blocks, OS page caches, WAL files, or backups.

        Returns:
            Number of memories deleted.
        """
        try:
            with self._conn:
                cur = self._conn.execute(
                    "DELETE FROM memories WHERE category = ?;",
                    (category.strip().lower(),),
                )
                deleted_count = cur.rowcount
            logger.info("Deleted %d memories in category '%s'", deleted_count, category)
            return deleted_count
        except sqlite3.Error as err:
            raise MemoryStorageError(f"Failed to delete by category: {type(err).__name__}")

    def count(
        self,
        category: Optional[str] = None,
        sensitivity: Optional[MemorySensitivity] = None,
    ) -> int:
        """Return total count of stored memories matching optional filters."""
        query = "SELECT COUNT(*) AS total FROM memories"
        conditions = []
        params: List[Any] = []

        if category:
            conditions.append("category = ?")
            params.append(category.strip().lower())
        if sensitivity:
            conditions.append("sensitivity = ?")
            params.append(sensitivity.value)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        cur = self._conn.cursor()
        cur.execute(query, params)
        row = cur.fetchone()
        return row["total"] if row else 0

    def search_fts(self, query: str, limit: int = 20) -> List[StoredMemory]:
        """Query the SQLite FTS5 index directly using BM25 ranking.

        Args:
            query: Raw search query text.
            limit: Maximum items to return (1..100).

        Returns:
            List of StoredMemory instances matching the FTS5 query.
        """
        cleaned_query = query.strip()
        if not cleaned_query:
            return []

        limit = max(1, min(limit, 100))
        keywords = self._extract_keywords(cleaned_query)
        if not keywords:
            return []

        # Safe parameterized FTS5 prefix match expression: '"word1"* AND "word2"*'
        match_expr = " AND ".join(f'"{w}"*' for w in sorted(keywords))

        try:
            cur = self._conn.cursor()
            cur.execute(
                """
                SELECT m.id, m.category, m.sensitivity, m.content, m.source_turn_id,
                       m.created_at, m.updated_at, m.access_count, m.last_accessed_at,
                       bm25(memories_fts) AS rank
                FROM memories m
                JOIN memories_fts f ON m.rowid = f.rowid
                WHERE memories_fts MATCH ?
                ORDER BY rank
                LIMIT ?;
                """,
                (match_expr, limit),
            )
            rows = cur.fetchall()
            return [self._row_to_stored_memory(r) for r in rows]
        except sqlite3.OperationalError as err:
            logger.warning("FTS5 search error: %s", type(err).__name__)
            return []
        except sqlite3.Error as err:
            raise MemoryStorageError(f"Database error during FTS5 search: {type(err).__name__}")


    # ------------------------------------------------------------------------
    # Relevance-Based Retrieval
    # ------------------------------------------------------------------------

    def recall(self, request: MemoryRecallRequest) -> List[StoredMemory]:
        """Retrieve relevant memories matching query text within configured budget.

        Explainable Scoring Strategy:
        1. Tokenize query text into lowercase keyword set (alphanumeric, len >= 2, non-stopword).
        2. Score candidates:
           - Keyword overlap ratio: (matching_keywords / total_query_keywords) * 0.50
           - Exact substring match boost: +0.30 if raw query text appears in content
           - Category match boost: +0.15 if category matches filter or appears in query
           - Recency boost: +0.05 if memory was created/updated within last 7 days
        3. Filter candidates where relevance_score >= min_relevance_threshold.
        4. Sort descending by score, limit to max_results.
        5. Atomically increment access_count and update last_accessed_at for returned items.

        Args:
            request: MemoryRecallRequest specifying query_text and filtering constraints.

        Returns:
            List of StoredMemory instances with populated relevance_score.
        """
        query_text = request.query_text.strip().lower()
        query_words = self._extract_keywords(query_text)

        # Base candidate fetch
        base_candidates = self.list(
            category=request.category_filter,
            sensitivity=request.sensitivity_filter,
            limit=200,
        )

        if not base_candidates:
            return []

        scored_memories: List[StoredMemory] = []
        now_dt = datetime.now(timezone.utc)

        for mem in base_candidates:
            content_lower = mem.content.lower()
            category_lower = mem.category.lower()

            score = 0.0

            # 1. Exact phrase match
            if query_text in content_lower:
                score += 0.30

            # 2. Keyword overlap
            if query_words:
                content_words = self._extract_keywords(content_lower)
                overlap = len(query_words.intersection(content_words))
                score += (overlap / len(query_words)) * 0.50

            # 3. Category match boost
            if request.category_filter or any(w in category_lower for w in query_words):
                score += 0.15

            # 4. Recency boost (within 7 days = 604800 seconds) - only for matching memories
            if score > 0.0:
                age_seconds = (now_dt - mem.updated_at).total_seconds()
                if age_seconds < 604800:
                    score += 0.05

            normalized_score = min(1.0, max(0.0, score))

            if normalized_score >= request.min_relevance_threshold and normalized_score > 0.0:
                scored = StoredMemory(
                    id=mem.id,
                    category=mem.category,
                    sensitivity=mem.sensitivity,
                    content=mem.content,
                    source_turn_id=mem.source_turn_id,
                    created_at=mem.created_at,
                    updated_at=mem.updated_at,
                    access_count=mem.access_count + 1,
                    last_accessed_at=now_dt,
                    relevance_score=round(normalized_score, 4),
                )
                scored_memories.append(scored)

        # Sort descending by relevance score
        scored_memories.sort(key=lambda m: (m.relevance_score or 0.0), reverse=True)
        results = scored_memories[: request.max_results]

        # Update access metrics in database for recalled items
        if results:
            now_str = now_dt.isoformat()
            recalled_ids = [m.id for m in results]
            try:
                with self._conn:
                    placeholders = ",".join("?" for _ in recalled_ids)
                    self._conn.execute(
                        f"""
                        UPDATE memories
                        SET access_count = access_count + 1, last_accessed_at = ?
                        WHERE id IN ({placeholders});
                        """,
                        [now_str] + recalled_ids,
                    )
            except sqlite3.Error as err:
                logger.warning("Failed to update access metrics: %s", type(err).__name__)

        logger.info("Recalled %d memories for query", len(results))
        return results

    @staticmethod
    def _extract_keywords(text: str) -> Set[str]:
        """Extract alphanumeric words >= 2 chars, omitting common stop words."""
        words = re.findall(r"\b[a-zA-Z0-9_\-]{2,}\b", text.lower())
        return {w for w in words if w not in COMMON_STOP_WORDS}

    @staticmethod
    def _row_to_stored_memory(row: sqlite3.Row) -> StoredMemory:
        """Convert a SQLite row to a typed StoredMemory model."""
        created_at_dt = datetime.fromisoformat(row["created_at"])
        updated_at_dt = datetime.fromisoformat(row["updated_at"])
        last_accessed_dt = (
            datetime.fromisoformat(row["last_accessed_at"])
            if row["last_accessed_at"]
            else None
        )
        return StoredMemory(
            id=row["id"],
            category=row["category"],
            sensitivity=MemorySensitivity(row["sensitivity"]),
            content=row["content"],
            source_turn_id=row["source_turn_id"],
            created_at=created_at_dt,
            updated_at=updated_at_dt,
            access_count=row["access_count"],
            last_accessed_at=last_accessed_dt,
            relevance_score=None,
        )


def format_for_context(memories: List[StoredMemory]) -> List[str]:
    """Format stored memories into concise strings for ContextManager prompt injection.

    CRITICAL SECURITY NOTICE:
    Memories are formatted with clear bracketed category labels to ensure they are
    treated as data context, NOT as system instructions or action permissions.

    Args:
        memories: List of retrieved StoredMemory items.

    Returns:
        List of formatted memory strings suitable for ContextManager.assemble_context().
    """
    return [
        f"[{m.category}] {m.content}"
        for m in memories
    ]
