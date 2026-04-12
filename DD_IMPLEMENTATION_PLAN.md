# Datadog Integration for L2 Support Troubleshooting

## Context

The L2 support team needs to troubleshoot user issues (e.g., "why can't user john@example.com log in to App X?") without manually switching between Datadog, Keycloak, and IAM dashboards. This change adds Datadog as a data source to the existing Platform Assistant, so the LLM agent can query Datadog logs, traces, metrics, monitors, and events alongside the existing IAM/Keycloak/Core API tools — all in a single conversation.

## Design Decisions

1. **Extend `UnifiedChatEngine`** (not a separate engine) — the LLM already chains tool calls across Keycloak/IAM/Core in one agentic loop. Adding Datadog tools to the same loop lets it naturally correlate auth errors in Datadog with user config in IAM/Keycloak without a separate view or endpoint.

2. **No new frontend view** — integrate into the existing "Platform Assistant" chat. Add Datadog-themed suggestion chips and a `datadog` source badge. L2 support uses the same chat, same sessions, same history.

3. **Graceful degradation** — when `DD_API_KEY`/`DD_APP_KEY` are not set, Datadog tools are excluded from the tool list and system prompt. Zero impact on existing behavior.

4. **No new database tables** — reuse `chat_history` and `llm_usage_logs`.

5. **No new Python dependencies** — use `httpx` (already installed) for all Datadog API calls, matching the pattern in `platform_api.py` and `keycloak_admin.py`.

---

## Implementation Steps

### Step 1: Create `datadog_api.py` (new file)

Async httpx client for Datadog APIs. Pattern follows `platform_api.py`.

**Module-level config:**
- `DD_API_KEY`, `DD_APP_KEY`, `DD_SITE` from env vars
- `DD_BASE_URL = f"https://api.{DD_SITE}"`
- `dd_available() -> bool` — returns True if both keys are set
- `_dd_headers()` — returns `{"DD-API-KEY": ..., "DD-APPLICATION-KEY": ..., "Content-Type": "application/json"}`
- `verify=True` (Datadog is external, unlike internal services)

**Functions (5):**

| Function | Datadog API | Purpose |
|----------|-------------|---------|
| `dd_search_logs(query, time_from, time_to, limit=50)` | POST `/api/v2/logs/events/search` | Auth errors, login failures, HTTP errors |
| `dd_search_traces(query, time_from, time_to, limit=20)` | POST `/api/v2/spans/events/search` | End-to-end request traces for a user/service |
| `dd_query_metrics(query, from_epoch, to_epoch)` | GET `/api/v1/query` | Error rates, latency percentiles |
| `dd_get_active_monitors(query="", tags=None)` | GET `/api/v1/monitor` | Currently triggered alerts |
| `dd_search_events(query, time_from, time_to)` | POST `/api/v2/events/search` | Deployments, incidents |

**Error handling:** Catch `httpx.HTTPStatusError` and `httpx.RequestError`, return `{"error": "...", "detail": "..."}` dicts (never raise). Consistent with how every tool result flows through the agentic loop.

**Response trimming:** Trim log/trace entries to essential fields (timestamp, service, status, message truncated to 500 chars, error kind/message, user email, HTTP status code) to prevent LLM context exhaustion.

**Helper:** `_parse_time_range(range_str) -> (str, str)` converts friendly strings like `"1h"`, `"6h"`, `"24h"`, `"7d"` to ISO 8601 UTC timestamps. This insulates the LLM from having to produce exact timestamps.

---

### Step 2: Add Datadog tools to `chat_engine.py`

**File:** `chat_engine.py`

**2a. Import and conditional tool list:**
- Import `dd_available` and the 5 functions from `datadog_api`
- Define `_DD_TOOLS` list (separate from `_TOOLS`) with 5 tool definitions
- In `chat()` method, build effective tool list: `tools = _TOOLS + (_DD_TOOLS if dd_available() else [])`
- Pass `tools` variable to both `_openai_loop` and `_gemini_loop` (currently hardcoded to `_TOOLS`)

**2b. Tool definitions (OpenAI function schema format):**

- `dd_search_logs` — params: `query` (string, Datadog log query syntax), `time_range` (string, enum: 1h/6h/24h/7d, default 1h), `service` (optional string). Description includes query syntax examples for the LLM.
- `dd_search_traces` — params: `query`, `time_range`, `service` (optional)
- `dd_query_error_rate` — params: `service` (string), `time_range` (string, default 1h)
- `dd_get_active_alerts` — params: `query` (optional), `service` (optional)
- `dd_search_events` — params: `query`, `time_range` (default 24h)

**2c. Augment system prompt conditionally:**

Define `_DD_SYSTEM_PROMPT_SECTION` with:
- Available Datadog data sources
- Troubleshooting methodology for login issues (check user in IAM -> check Keycloak config -> check Datadog logs for auth errors -> check active alerts -> correlate)
- Query syntax guidance for the LLM

In `chat()`, build system prompt: `prompt = SYSTEM_PROMPT + (_DD_SYSTEM_PROMPT_SECTION if dd_available() else "")`

**2d. Refactor `_openai_loop` and `_gemini_loop` signatures:**

Change from hardcoded `_TOOLS` reference to accept `tools` and `system_prompt` parameters passed from `chat()`. This is a small signature change (~4 lines each).

**2e. Add tool dispatch in `_execute_tool()`:**

After the `# -- Observability` section (line ~1087), add:

```python
# -- Datadog --------------------------------------------------------
if name == "dd_search_logs":
    time_range = args.get("time_range", "1h")
    from_ts, to_ts = _parse_time_range(time_range)
    query = args.get("query", "")
    service = args.get("service")
    if service:
        query = f"service:{service} {query}".strip()
    return await dd_search_logs(query, from_ts, to_ts)

if name == "dd_search_traces":
    ...  # similar pattern

if name == "dd_query_error_rate":
    ...  # builds metric query string, calls dd_query_metrics

if name == "dd_get_active_alerts":
    ...  # calls dd_get_active_monitors with optional filters

if name == "dd_search_events":
    ...  # calls dd_search_events
```

---

### Step 3: Configuration updates

**3a. `.env.example` -- add 3 new variables:**
```
# -- Datadog (optional -- omit to disable observability tools) -----
DD_API_KEY=
DD_APP_KEY=
DD_SITE=datadoghq.com
```

**3b. `docker-compose.yml` -- pass to backend service:**
```yaml
DD_API_KEY:   ${DD_API_KEY:-}
DD_APP_KEY:   ${DD_APP_KEY:-}
DD_SITE:      ${DD_SITE:-datadoghq.com}
```

---

### Step 4: Frontend updates (`App.jsx`)

Three small changes:

**4a. `sourceService()` (line 2197):** Add `if (toolName.startsWith("dd_")) return "datadog";`

**4b. `sourceColor()` (line 2204):** Add `if (service === "datadog") return "#632CA6";` (Datadog purple)

**4c. `CHAT_SUGGESTIONS` (line 2222):** Add troubleshooting-themed suggestions:
```javascript
{ text: "Why can't user john@example.com log in?",         svc: "datadog" },
{ text: "Show auth errors for login service in last hour",  svc: "datadog" },
{ text: "What's the error rate for the login service?",     svc: "datadog" },
{ text: "Are there active alerts on authentication?",       svc: "datadog" },
```

---

### Step 5: Startup logging in `main.py`

Add a log line in the `lifespan` function indicating whether Datadog is enabled:
```python
from datadog_api import dd_available
if dd_available():
    log.info("Datadog integration enabled (DD_SITE=%s)", os.getenv("DD_SITE", "datadoghq.com"))
else:
    log.info("Datadog integration disabled (DD_API_KEY/DD_APP_KEY not set)")
```

---

### Step 6: Update `CLAUDE.md`

- Add `datadog_api.py` to the key backend modules table
- Update the architecture diagram to show Datadog as an external data source
- Add extension point: "Add Datadog data sources: `datadog_api.py` + register tools in `chat_engine.py`"

---

## Files Modified

| File | Change |
|------|--------|
| `datadog_api.py` | **NEW** -- Datadog API client (~180 lines) |
| `chat_engine.py` | Add DD tools, conditional tool list, system prompt section, tool dispatch |
| `.env.example` | Add `DD_API_KEY`, `DD_APP_KEY`, `DD_SITE` |
| `docker-compose.yml` | Pass DD env vars to backend |
| `App.jsx` | Add `datadog` source service/color + suggestion chips |
| `main.py` | Startup log for Datadog status |
| `CLAUDE.md` | Document new module and extension point |

## Verification

1. **Without Datadog keys:** Start the app with no `DD_*` env vars. Confirm the Platform Assistant works exactly as before -- no Datadog tools in LLM responses, no errors in logs.
2. **With Datadog keys:** Set `DD_API_KEY`, `DD_APP_KEY`, `DD_SITE` in `.env`. Start the app. Confirm startup log says "Datadog integration enabled".
3. **Chat test:** In the Platform Assistant, ask "Why can't user john@example.com log in?" -- confirm the agent calls both IAM tools (user lookup) and Datadog tools (log search), and the response cites both sources with correct badges.
4. **Suggestion chips:** Verify the new Datadog-themed suggestions appear in the chat UI with purple badges.
5. **Error handling:** Set an invalid `DD_API_KEY`. Ask a Datadog question. Confirm the agent reports the error gracefully and answers with whatever data it has from other sources.
