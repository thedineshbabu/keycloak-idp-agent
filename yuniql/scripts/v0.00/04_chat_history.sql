-- v0.00 / 04 — Chat history (ported from SQLite)
SET search_path TO idp_agent, public;

CREATE TABLE IF NOT EXISTS chat_history (
    id          SERIAL PRIMARY KEY,
    session_id  VARCHAR(200) NOT NULL,
    user_sub    VARCHAR(200) NOT NULL,
    user_email  VARCHAR(200) DEFAULT '',
    role        VARCHAR(20)  NOT NULL,
    message     TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_user    ON chat_history (user_sub, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history (session_id);
