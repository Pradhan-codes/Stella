"""Finite State Machine (FSM) for Stella Python Brain.

Defines the 10 explicit operational states and enforces deterministic,
programmatic transition validation. Untrusted model outputs cannot
directly trigger or authorize state transitions.
"""

import logging
from enum import Enum
from typing import Callable, Dict, List, Optional, Set

logger = logging.getLogger("stella.brain.fsm")


class BrainState(str, Enum):
    """The 10 explicit operational states of the Stella cognitive subsystem."""

    OFFLINE = "OFFLINE"
    INITIALIZING = "INITIALIZING"
    STANDBY = "STANDBY"
    LISTENING = "LISTENING"
    THINKING = "THINKING"
    PLANNING = "PLANNING"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    EXECUTING = "EXECUTING"
    SPEAKING = "SPEAKING"
    ERROR = "ERROR"


# Explicit transition table defining permitted state changes.
# Any transition not declared here is strictly rejected.
ALLOWED_TRANSITIONS: Dict[BrainState, Set[BrainState]] = {
    BrainState.OFFLINE: {
        BrainState.INITIALIZING,
    },
    BrainState.INITIALIZING: {
        BrainState.STANDBY,
        BrainState.ERROR,
    },
    BrainState.STANDBY: {
        BrainState.LISTENING,
        BrainState.OFFLINE,
        BrainState.ERROR,
    },
    BrainState.LISTENING: {
        BrainState.THINKING,
        BrainState.STANDBY,
        BrainState.ERROR,
    },
    BrainState.THINKING: {
        BrainState.PLANNING,
        BrainState.AWAITING_CONFIRMATION,
        BrainState.EXECUTING,
        BrainState.SPEAKING,
        BrainState.STANDBY,
        BrainState.ERROR,
    },
    BrainState.PLANNING: {
        BrainState.AWAITING_CONFIRMATION,
        BrainState.EXECUTING,
        BrainState.SPEAKING,
        BrainState.THINKING,
        BrainState.STANDBY,
        BrainState.ERROR,
    },
    BrainState.AWAITING_CONFIRMATION: {
        BrainState.EXECUTING,
        BrainState.SPEAKING,
        BrainState.STANDBY,
        BrainState.ERROR,
    },
    BrainState.EXECUTING: {
        BrainState.THINKING,
        BrainState.SPEAKING,
        BrainState.STANDBY,
        BrainState.ERROR,
    },
    BrainState.SPEAKING: {
        BrainState.STANDBY,
        BrainState.ERROR,
    },
    BrainState.ERROR: {
        BrainState.STANDBY,
        BrainState.INITIALIZING,
        BrainState.OFFLINE,
    },
}


class InvalidStateTransitionError(Exception):
    """Raised when an illegal or unmapped state transition is attempted."""

    def __init__(self, current_state: BrainState, target_state: BrainState, reason: str = ""):
        message = (
            f"Invalid state transition attempted: {current_state.value} -> {target_state.value}."
        )
        if reason:
            message += f" Reason: {reason}"
        super().__init__(message)
        self.current_state = current_state
        self.target_state = target_state
        self.reason = reason


# In-process callback type: (old_state, new_state, reason) -> None
StateChangeCallback = Callable[[BrainState, BrainState, str], None]


class BrainFSM:
    """Manages explicit BrainState transitions with deterministic guards."""

    def __init__(
        self,
        initial_state: BrainState = BrainState.OFFLINE,
        on_transition: Optional[StateChangeCallback] = None,
    ):
        self._current_state: BrainState = initial_state
        self._callbacks: List[StateChangeCallback] = []
        if on_transition:
            self._callbacks.append(on_transition)

    @property
    def current_state(self) -> BrainState:
        """Return the active BrainState."""
        return self._current_state

    @property
    def state(self) -> BrainState:
        """Alias for current_state."""
        return self._current_state

    def add_callback(self, callback: StateChangeCallback) -> None:
        """Register an in-process state change listener."""
        if callback not in self._callbacks:
            self._callbacks.append(callback)

    def remove_callback(self, callback: StateChangeCallback) -> None:
        """Remove an in-process state change listener."""
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def can_transition_to(self, target_state: BrainState) -> bool:
        """Check whether a transition from the current state to target is permitted."""
        allowed = ALLOWED_TRANSITIONS.get(self._current_state, set())
        return target_state in allowed

    def transition_to(self, target_state: BrainState, reason: str = "") -> None:
        """Transition the FSM to a new state if permitted by the transition table.

        Args:
            target_state: The destination BrainState.
            reason: Optional diagnostic string describing the cause of the transition.

        Raises:
            InvalidStateTransitionError: If the transition is disallowed.
        """
        if not self.can_transition_to(target_state):
            raise InvalidStateTransitionError(
                current_state=self._current_state,
                target_state=target_state,
                reason=reason,
            )

        old_state = self._current_state
        self._current_state = target_state

        # Dispatch registered in-process callbacks
        for callback in self._callbacks:
            try:
                callback(old_state, target_state, reason)
            except Exception as err:
                # Callbacks must never corrupt FSM state.
                # Safe diagnostic: log callback identifier and error type only.
                # Do NOT log str(err) or raw exception details to prevent secret leakage.
                callback_name = getattr(
                    callback, "__qualname__", getattr(callback, "__name__", type(callback).__name__)
                )
                logger.warning(
                    "FSM state transition callback '%s' failed during %s -> %s with error type '%s'.",
                    callback_name,
                    old_state.value,
                    target_state.value,
                    type(err).__name__,
                )
