# Plan: Replace SQLite with PostgreSQL-only + yuniql Migrations

## Context

The app currently has a dual-database pattern in `tools.py`: it tries PostgreSQL and silently falls back to SQLite (`usage.db`). This causes problems:
- `chat_history` only exists in SQLite — lost on container restart
- `cert_alerts` only works with PostgreSQL — no fallback
- `idp_configurations` is referenced but never defined in the schema
- Every DB function maintains two code paths (PostgreSQL `%s` + SQLite `?`)

The goal is to eliminate SQLite entirely, make PostgreSQL the sole database, and set up yuniql migrations following the `kfone-iam-service` reference pattern.

---

## Step 1: Create yuniql directory structure

Create `yuniql/scripts/` tree with placeholder dirs and initial migration:

```
yuniql/scripts/
  Dockerfile                      # FROM yuniql/yuniql:v1.3.69
  _init/.gitignore                # empty placeholder
  _pre/.gitignore
  _post/.gitignore
  _draft/.gitignore
  _erase/.gitignore
  v0.00/
    README.md                     # describes initial schema
    01_create_schema.sql          # CREATE SCHEMA IF NOT EXISTS idp_agent
    02_llm_usage_logs.sql         # from schema.sql + audit columns
    03_cert_alerts.sql            # from schema.sql + audit columns
    04_chat_history.sql           # NEW — ported from SQLite _sqlite_conn()
    05_idp_configurations.sql     # NEW — matches columns used in fetch_existing_idps()
```

**Schema name:** `idp_agent`

**Tables in v0.00:**

| Table | Source | Notes |
|-------|--------|-------|
| `llm_usage_logs` | Existing `schema.sql` line 5-17 | Add audit columns (created_by, updated_by, etc.) |
| `cert_alerts` | Existing `schema.sql` line 23-30 | Add audit columns |
| `chat_history` | SQLite-only `_sqlite_conn()` line 63-73 | Port to PostgreSQL types |
| `idp_configurations` | Referenced at `tools.py:144-148` but never defined | Derive columns from SELECT + mock data |

All SQL uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` for idempotency (kfone-iam-service convention).

---

## Step 2: Remove SQLite from `tools.py`

**File:** `tools.py`

| What | Lines | Action |
|------|-------|--------|
| `import sqlite3` | 8 | Remove |
| `_SQLITE_PATH` | 31 | Remove |
| `get_db_connection()` | 36-42 | Rewrite: PostgreSQL-only, add `search_path=idp_agent,public` via connection options |
| `_sqlite_conn()` | 45-76 | Delete entirely |
| `save_chat_message()` | 81-94 | Rewrite: `%s` params, use `get_db_connection()` |
| `get_chat_sessions()` | 97-118 | Rewrite: `%s` params, use `get_db_connection()` |
| `get_session_messages()` | 121-134 | Rewrite: `%s` params, use `get_db_connection()` |
| `fetch_existing_idps()` | 137-157 | Simplify: remove `kind != "postgres"` guard |
| `fetch_idp_by_domain()` | 160-190 | Simplify: remove `kind != "postgres"` guard |
| `log_llm_usage()` | 614-651 | Remove SQLite else-branch (lines 639-649) |
| `get_usage_summary()` | 658-707 | Remove SQLite else-branch (lines 682-699) |
| `get_usage_by_provider()` | 710-741 | Remove SQLite else-branch (lines 727-738) |
| `get_usage_timeline()` | 744-773 | Remove SQLite else-branch (lines 760-770) |
| `get_recent_usage()` | 776-798 | Remove SQLite else-branch (lines 789-796) |
| `log_cert_alerts()` | 847-871 | Remove `kind != "postgres"` early-return guard |

**Key detail:** `get_db_connection()` will set `search_path=idp_agent,public` via psycopg2 `options` param, so all existing bare table names in SQL queries continue to work without prefixing.

---

## Step 3: Update `docker-compose.yml`

- Remove `schema.sql` volume mount (line 13: `./schema.sql:/docker-entrypoint-initdb.d/01_schema.sql:ro`)
- Replace with: `./yuniql/scripts/v0.00:/docker-entrypoint-initdb.d:ro` — Postgres auto-runs the numbered `.sql` files on init

---

## Step 4: Update `Dockerfile`

- Remove `COPY schema.sql ./` (line 15-16) — backend container doesn't need schema at runtime

---

## Step 5: Delete `schema.sql` and `usage.db`

- Delete `schema.sql` — superseded by `yuniql/scripts/v0.00/`
- Delete `usage.db` — SQLite artifact
- Add `*.db` to `.gitignore`

---

## Step 6: Update `database-deploy.yml` workflow

**File:** `.github/workflows/database-deploy.yml`

Replace `psql -f schema.sql` with yuniql CLI:
1. Install yuniql v1.1.55
2. Create `idp_agent` schema via psql
3. Run `yuniql init && yuniql run -p './scripts' --meta-table db_migration_yuniql_idp_agent --platform postgresql`
4. Use `SslMode=Require;TrustServerCertificate=true` for production

---

## Step 7: Create `database-scripts-unit-test.yml` workflow

**New file:** `.github/workflows/database-scripts-unit-test.yml`

- Triggers on PR/push to main, develop, rc/v**
- Spins up PostgreSQL 16 service container
- Creates `idp_agent` schema
- Runs yuniql migrations
- Validates all scripts apply cleanly

---

## Step 8: Update `ci.yml` workflow

Replace `psql -f schema.sql` in the "Initialise database" step with:
```bash
psql -c "CREATE SCHEMA IF NOT EXISTS idp_agent;"
psql -c "ALTER ROLE iam_user SET search_path TO idp_agent, public;"
for f in yuniql/scripts/v0.00/*.sql; do psql -f "$f"; done
```

---

## Step 9: Update documentation

- **CLAUDE.md:** Update DB commands, remove SQLite fallback mention
- **README.md:** Update file tree, replace schema.sql references with yuniql
- **.gitignore:** Add `*.db`

---

## Files to modify

| File | Action |
|------|--------|
| `tools.py` | Major rewrite — remove all SQLite code |
| `docker-compose.yml` | Swap volume mount |
| `Dockerfile` | Remove schema.sql COPY |
| `.github/workflows/database-deploy.yml` | Replace psql with yuniql |
| `.github/workflows/ci.yml` | Update DB init step |
| `.gitignore` | Add `*.db` |
| `CLAUDE.md` | Update DB docs |
| `schema.sql` | Delete |
| `usage.db` | Delete |

## New files

| File | Purpose |
|------|---------|
| `yuniql/scripts/Dockerfile` | Yuniql container image |
| `yuniql/scripts/_init/.gitignore` | Placeholder |
| `yuniql/scripts/_pre/.gitignore` | Placeholder |
| `yuniql/scripts/_post/.gitignore` | Placeholder |
| `yuniql/scripts/_draft/.gitignore` | Placeholder |
| `yuniql/scripts/_erase/.gitignore` | Placeholder |
| `yuniql/scripts/v0.00/README.md` | Migration docs |
| `yuniql/scripts/v0.00/01_create_schema.sql` | Schema creation |
| `yuniql/scripts/v0.00/02_llm_usage_logs.sql` | LLM usage table |
| `yuniql/scripts/v0.00/03_cert_alerts.sql` | Cert alerts table |
| `yuniql/scripts/v0.00/04_chat_history.sql` | Chat history table |
| `yuniql/scripts/v0.00/05_idp_configurations.sql` | IDP configs table |
| `.github/workflows/database-scripts-unit-test.yml` | DB migration CI |

---

## Verification

1. `docker compose up --build` — Postgres starts, v0.00 scripts run, backend connects
2. Hit `/health` endpoint — returns 200
3. Hit `/chat` — chat messages save to PostgreSQL `chat_history` (not SQLite)
4. Hit `/usage/summary` — returns data from PostgreSQL `llm_usage_logs`
5. Confirm `usage.db` is not created anywhere
6. `grep -r sqlite3 *.py` — returns nothing
7. Run the database-scripts-unit-test workflow — yuniql applies cleanly
