# RBAC Phase 1: Admin vs Read-Only User

## Context

The application currently has partial RBAC — `require_admin` guards some write endpoints, but there are gaps in both the backend and frontend. A non-admin user can see write action buttons (user management actions, certificate rotation, IDP edit/clone) that will fail with a raw 403 error. Worse, the chat engine bypasses HTTP-level auth entirely — a non-admin user can ask the assistant to lock a user or reset a password and it will execute. The frontend `isAdmin` flag defaults to `true` (security bug), meaning a broken token parse grants admin access.

**Goal:** Enforce two-tier access — `agent-admin` role = full access, everyone else = read-only with a clean "You need admin privileges to perform this action" message everywhere.

---

## 1. Backend: `auth.py` (1 change)

**File:** `auth.py:116`

Update the 403 message in `require_admin` to the user-friendly text:

```python
# Line 116 — change:
raise HTTPException(status_code=403, detail="agent-admin role required")
# to:
raise HTTPException(status_code=403, detail="You need admin privileges to perform this action")
```

No other structural changes needed — `verify_token` and `require_admin` are well-designed. The `/onboard-user` endpoint stays with `verify_token` (it's self-service by design).

---

## 2. Backend: `main.py` (1 change)

**File:** `main.py:244`

Pass user roles into the chat engine so it can gate write tools:

```python
# Line 244-250 — add user_roles parameter:
result = await unified_engine.chat(
    message=req.message,
    history=history,
    realm=realm,
    token=token,
    provider=req.llm_provider,
    user_roles=user.get("roles", []),
)
```

---

## 3. Backend: `chat_engine.py` (4 changes)

This is the critical gap — the chat engine's `_execute_tool` calls write functions (lock, reset password, magic link, status change, SSO attribute create/upsert, Keycloak mapper ensure) directly without any role check.

### 3a. Add write-tool set (after line 49, before `SYSTEM_PROMPT`)

```python
_WRITE_TOOLS = frozenset({
    "iam_lock_unlock_users",
    "iam_update_user_status",
    "iam_reset_password",
    "iam_send_magic_link",
    "iam_send_otp",
    "core_create_sso_attributes",
    "core_upsert_sso_attributes",
    "keycloak_ensure_userid_mapper",
})
```

### 3b. Add `user_roles` parameter to `chat()` (line 692)

```python
async def chat(self, message, history, realm, token, provider="openai", user_roles=None):
```

Thread it to the loop calls on lines 713-714:
```python
return await self._gemini_loop(messages, realm, token, user_roles)
return await self._openai_loop(messages, realm, token, user_roles)
```

### 3c. Add `user_roles` to both loop methods and `_execute_tool`

- `_openai_loop(self, messages, realm, token, user_roles=None)` — line 718
  - Pass to `_execute_tool` at line 775: `await self._execute_tool(fn_name, fn_args, realm, token, user_roles)`
- `_gemini_loop(self, messages, realm, token, user_roles=None)` — line 800
  - Pass to `_execute_tool` at line 871: `await self._execute_tool(fn_name, fn_args, realm, token, user_roles)`
- `_execute_tool(self, name, args, realm, token, user_roles=None)` — line 897

### 3d. Add guard at top of `_execute_tool` (line 900, inside the try block)

```python
if name in _WRITE_TOOLS and "agent-admin" not in (user_roles or []):
    return {"error": "You need admin privileges to perform this action", "tool": name, "blocked": True}
```

The LLM receives this error as the tool result and relays a natural-language version to the user.

---

## 4. Frontend: `App.jsx` (5 changes)

### 4a. Fix `isAdmin` default — **security bug** (line 2921)

```js
// Change from:
const isAdmin = user?.roles?.includes("agent-admin") ?? true;
// To:
const isAdmin = user?.roles?.includes("agent-admin") ?? false;
```

### 4b. Add 403 handling in `apiErrorMsg` (line 331)

```js
function apiErrorMsg(body, status) {
  if (status === 403) return "You need admin privileges to perform this action";
  // ... rest unchanged
}
```

This is defense-in-depth — if a non-admin somehow triggers a backend write, they see the standard message instead of raw JSON.

### 4c. Pass `isAdmin` to views that have write actions (lines 2979-2988)

```jsx
{view === "users"        && <UserManagementView isAdmin={isAdmin} />}
{view === "get-idp"      && <GetIDPView llmProvider={llmProvider} isAdmin={isAdmin} />}
{view === "certificates" && <CertificatesView isAdmin={isAdmin} />}
```

Other views don't need it: `OnboardView`/`UpdateView`/`TokenSetupView` are already nav-filtered by `adminOnly`, `ClientExplorerView`/`UsageView` are read-only, `MyIDPView` is self-service, `UnifiedChatView` is gated server-side.

### 4d. Gate write actions in three views

**UserManagementView** (line 1987 — accept `{ isAdmin }` prop):
- Lines 2160-2172: Replace the action buttons block with a conditional — show buttons for admin, show "You need admin privileges" info box for non-admin.

**GetIDPView** (line 745 — accept `{ llmProvider, isAdmin }` prop):
- Lines 891-904: Wrap Edit + Clone buttons in `{isAdmin && (...)}` so non-admins see the IDP data read-only without edit/clone options.

**CertificatesView** (line 1396 — accept `{ isAdmin }` prop):
- Lines 1493-1524: Wrap the entire "Rotate Certificate" card in `{isAdmin && (...)}` so non-admins see scan results but not the rotation form.

---

## Files to modify

| File | Changes |
|------|---------|
| `auth.py` | Line 116: update 403 message |
| `main.py` | Lines 244-250: pass `user_roles` to chat engine |
| `chat_engine.py` | Add `_WRITE_TOOLS` set; thread `user_roles` through `chat()` -> loops -> `_execute_tool()`; add guard |
| `App.jsx` | Line 2921: fix default; line 331: add 403 handling; lines 2979-2988: pass `isAdmin` props; gate buttons in 3 views |

---

## Verification

1. **Admin user**: All views and actions work unchanged
2. **Non-admin user**:
   - Nav hides Onboard/Update/Token Setup (existing behavior)
   - User Management shows "admin privileges required" instead of action buttons
   - Get IDP shows data but no Edit/Clone buttons
   - Certificates shows scan data but no Rotate form
   - Chat assistant refuses write tool calls with friendly message
3. **Backend defense**: Direct POST to `/onboard`, `/update`, etc. returns 403 with standard message
4. **Frontend defense**: Any 403 from backend shows "You need admin privileges" (via `apiErrorMsg`)
5. **Local dev**: `KEYCLOAK_ENABLED=false` still gets `agent-admin` role (no change to synthetic context)
6. **Self-service**: Non-admin can still use "Add My IDP" (`/onboard-user`)

---

## Future extensibility

- **auth.py**: `require_admin` can become `require_role("cert-admin")` or `require_permission("users:write")`
- **chat_engine.py**: `_WRITE_TOOLS` can become a `_TOOL_PERMISSIONS` dict mapping tools to required roles
- **App.jsx**: `isAdmin` can become a `permissions` object (e.g., `{canManageUsers: true, canRotateCerts: false}`) and the prop drilling converts to React context
