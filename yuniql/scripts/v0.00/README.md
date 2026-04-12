# v0.00 — Initial Schema

Creates the `idp_agent` schema and application tables:

| Script | Table | Description |
|--------|-------|-------------|
| `01_create_schema.sql` | — | Creates the `idp_agent` schema |
| `02_llm_usage_logs.sql` | `llm_usage_logs` | LLM token usage and cost tracking |
| `04_chat_history.sql` | `chat_history` | Persisted chat sessions |

IDP configurations and certificate data are managed via the Core API custom attributes endpoint — no local tables needed.

All scripts use `IF NOT EXISTS` for idempotency.
