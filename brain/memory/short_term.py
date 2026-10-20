"""Session-scoped in-memory working memory store for Stella Python Brain.

Maintains ephemeral conversation turns, active goals, and temporary scratchpad
data during a running session. Enforces strict capacity bounds and FIFO eviction.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. In-Memory Only: This module NEVER writes to disk, SQLite, or persistent storage.
2. Ephemeral Lifecycle: All state is discarded upon session reset, application shutdown,
   or window reload.
3. Deterministic Eviction: Rolling turns are bound by max_turns; oldest turns are
   evicted (FIFO) when capacity is reached.
"""

from collections import deque
from typing import Any, Dict, List, Optional
from uuid import uuid4

from brain.adapters.base import ChatMessage
from brain.memory.schema import ConversationTurn


class SessionMemoryStore:
    """In-memory store for session-scoped conversation history and working state."""

    def __init__(self, max_turns: int = 50, session_id: Optional[str] = None):
        """Initialize the session working memory.

        Args:
            max_turns: Maximum number of conversation turns retained before FIFO eviction.
            session_id: Optional unique identifier for this session.
        """
        if max_turns < 1:
            raise ValueError(f"max_turns must be at least 1, got {max_turns}.")
        self.max_turns = max_turns
        self.session_id = session_id or str(uuid4())
        self._turns: deque[ConversationTurn] = deque(maxlen=max_turns)
        self._goals: List[str] = []
        self._scratchpad: Dict[str, Any] = {}

    @property
    def turn_count(self) -> int:
        """Current number of turns stored in memory."""
        return len(self._turns)

    def add_turn(self, turn: ConversationTurn) -> None:
        """Append a conversational turn to working memory.

        If capacity (max_turns) is exceeded, the oldest turn is automatically evicted.
        """
        self._turns.append(turn)

    def get_turns(self, limit: Optional[int] = None) -> List[ConversationTurn]:
        """Retrieve recent conversation turns in chronological order.

        Args:
            limit: Optional maximum number of recent turns to retrieve.

        Returns:
            Chronological list of ConversationTurn instances.
        """
        turns = list(self._turns)
        if limit is not None and limit < len(turns):
            return turns[-limit:]
        return turns

    def to_chat_messages(self, limit: Optional[int] = None) -> List[ChatMessage]:
        """Convert stored turns into ChatMessage instances formatted for ContextManager.

        Args:
            limit: Optional maximum number of recent turns to convert.

        Returns:
            List of ChatMessage instances.
        """
        turns = self.get_turns(limit=limit)
        return [
            ChatMessage(
                role=t.role,
                content=t.content,
            )
            for t in turns
        ]

    # ------------------------------------------------------------------------
    # Working Goals Management
    # ------------------------------------------------------------------------

    def add_goal(self, goal: str) -> None:
        """Add an active working goal to the session context."""
        cleaned = goal.strip()
        if cleaned and cleaned not in self._goals:
            self._goals.append(cleaned)

    def remove_goal(self, goal: str) -> bool:
        """Remove a goal from the session context if present."""
        if goal in self._goals:
            self._goals.remove(goal)
            return True
        return False

    def get_goals(self) -> List[str]:
        """Return a copy of the active session goals."""
        return list(self._goals)

    def clear_goals(self) -> None:
        """Clear all active session goals."""
        self._goals.clear()

    # ------------------------------------------------------------------------
    # Scratchpad Key-Value Management
    # ------------------------------------------------------------------------

    def set_scratchpad(self, key: str, value: Any) -> None:
        """Store an ephemeral key-value item in the working scratchpad."""
        self._scratchpad[key] = value

    def get_scratchpad(self, key: str, default: Any = None) -> Any:
        """Retrieve an item from the session scratchpad."""
        return self._scratchpad.get(key, default)

    def delete_scratchpad(self, key: str) -> bool:
        """Delete a key from the session scratchpad."""
        if key in self._scratchpad:
            del self._scratchpad[key]
            return True
        return False

    def get_all_scratchpad(self) -> Dict[str, Any]:
        """Return a shallow copy of the full scratchpad dictionary."""
        return dict(self._scratchpad)

    def clear_scratchpad(self) -> None:
        """Clear all ephemeral items from the scratchpad."""
        self._scratchpad.clear()

    # ------------------------------------------------------------------------
    # Session Reset
    # ------------------------------------------------------------------------

    def clear(self) -> None:
        """Completely reset all working memory, turns, goals, and scratchpad."""
        self._turns.clear()
        self._goals.clear()
        self._scratchpad.clear()
