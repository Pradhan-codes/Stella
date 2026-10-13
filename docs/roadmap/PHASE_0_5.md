# Direct calls for request/response, plus isolated asynchronous events for status updates and notifications.
# In-process event dispatcher initially; no message broker or microservices.
# UUID identifiers and Pydantic models for Python contracts.
# Structured errors, operation-specific timeouts, and cancellation where supported.
# Bounded retries only when safe; protect against duplicate side effects.
# Version contracts when compatibility requires it.
# Best-effort in-memory events initially; no durable-delivery guarantee.
# Redact secrets and sensitive personal information from logs.
# The Brain proposes actions; the independent tool gateway enforces authorization.
# Unfinished component details remain explicitly provisional.