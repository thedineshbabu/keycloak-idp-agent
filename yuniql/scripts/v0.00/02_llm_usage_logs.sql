-- v0.00 / 02 — LLM usage logging
SET search_path TO idp_agent, public;

CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id                  SERIAL PRIMARY KEY,
    operation           VARCHAR(100),
    llm_provider        VARCHAR(50),
    model               VARCHAR(100),
    prompt_tokens       INT,
    completion_tokens   INT,
    total_tokens        INT,
    estimated_cost_usd  NUMERIC(10, 6),
    duration_ms         INT,
    success             BOOLEAN,
    created_at          TIMESTAMPTZ DEFAULT now(),
    created_by          VARCHAR(200) DEFAULT 'system',
    updated_at          TIMESTAMPTZ DEFAULT now(),
    updated_by          VARCHAR(200) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created   ON llm_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_operation ON llm_usage_logs (operation);
