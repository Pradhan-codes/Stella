"""Logging configuration with defense-in-depth credential redaction.

IMPORTANT LIMITATION & SECURITY NOTICE:
The redaction filters implemented here are defense-in-depth controls aimed at
preventing common credentials, tokens, and keys from accidentally spilling into
logs. Redaction cannot mathematically guarantee that every arbitrary sensitive
payload, unstructured disclosure, or novel secret format will be recognized.
System components must avoid passing raw secrets, passwords, or persistent
personal memories into log statements in the first place.
"""

import logging
import re
from typing import List, Pattern

# Common credential and token patterns for defense-in-depth filtering
REDACTION_PATTERNS: List[Pattern[str]] = [
    # Common API key formats (e.g. sk-..., secret-...)
    re.compile(r"(?i)\b(sk-[a-zA-Z0-9_\-]{20,})\b"),
    # HTTP Bearer / Authorization headers
    re.compile(r"(?i)\b(bearer\s+[a-zA-Z0-9_\-\.]{16,})\b"),
    # Generic key-value secret assignments: api_key = "...", token: '...'
    re.compile(
        r"(?i)\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*['\"]?([a-zA-Z0-9_\-\.]{8,})['\"]?"
    ),
    # Password assignments: password: "..."
    re.compile(r"(?i)\b(password|passwd|pwd)\s*[:=]\s*['\"]?([^'\"\s\r\n]{4,})['\"]?"),
    # PEM Private Key Blocks
    re.compile(r"-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----"),
    # JWT tokens (three base64url segments separated by dots)
    re.compile(r"\beyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\b"),
]

REDACTED_SUBSTITUTION = "[REDACTED]"


def redact_sensitive_text(text: str) -> str:
    """Scrub known credential, key, and token patterns from text.

    Args:
        text: The input string to sanitize.

    Returns:
        A sanitized string with matching patterns replaced by '[REDACTED]'.
    """
    if not text:
        return text

    sanitized = text
    for pattern in REDACTION_PATTERNS:
        # For patterns with capture groups, redact the matched value while keeping key label if applicable
        if pattern.groups == 2:
            sanitized = pattern.sub(rf"\1={REDACTED_SUBSTITUTION}", sanitized)
        else:
            sanitized = pattern.sub(REDACTED_SUBSTITUTION, sanitized)

    return sanitized


class RedactingFilter(logging.Filter):
    """Logging filter that scrubs sensitive strings from log records before emission."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_sensitive_text(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: (redact_sensitive_text(v) if isinstance(v, str) else v)
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    redact_sensitive_text(v) if isinstance(v, str) else v
                    for v in record.args
                )
        return True


class RedactingFormatter(logging.Formatter):
    """Logging formatter that passes the complete formatted log output through redaction.

    Guarantees that messages, exception tracebacks, and stack traces are
    strictly scrubbed before emission to handlers or console streams.
    """

    def format(self, record: logging.LogRecord) -> str:
        formatted = super().format(record)
        return redact_sensitive_text(formatted)


def setup_logging(
    level: int = logging.INFO,
    logger_name: str = "stella.brain",
) -> logging.Logger:
    """Configure and return the root Stella Brain logger with redaction filters."""
    logger = logging.getLogger(logger_name)
    logger.setLevel(level)

    # Avoid duplicate handlers if setup is called multiple times
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = RedactingFormatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(RedactingFilter())
        logger.addHandler(handler)

    return logger
