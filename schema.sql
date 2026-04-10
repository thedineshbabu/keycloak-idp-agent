-- Run this against your iam_db database to create the tables needed by the agent.
-- Existing tables (idp_configurations) are assumed to already exist.

-- Token usage logging (Item 1: Usage Monitoring)
CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id                  SERIAL PRIMARY KEY,
    operation           VARCHAR(100),         -- e.g. "onboard_idp", "chat", "update_idp"
    llm_provider        VARCHAR(50),           -- "openai" or "gemini"
    model               VARCHAR(100),          -- "gpt-4o", "gemini-1.5-pro"
    prompt_tokens       INT,
    completion_tokens   INT,
    total_tokens        INT,
    estimated_cost_usd  NUMERIC(10, 6),
    duration_ms         INT,
    success             BOOLEAN,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_operation ON llm_usage_logs (operation);

-- Certificate expiry alerts (Item 3: Certificate Rotation)
CREATE TABLE IF NOT EXISTS cert_alerts (
    id              SERIAL PRIMARY KEY,
    idp_name        VARCHAR(200),
    email_domain    VARCHAR(200) UNIQUE,
    days_remaining  INT,
    expiry_date     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);
