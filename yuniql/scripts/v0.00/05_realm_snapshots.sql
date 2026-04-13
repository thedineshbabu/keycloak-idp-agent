-- Realm configuration snapshots
-- Stores the output of Keycloak's partial-export endpoint so operators can
-- audit configuration drift and restore a known-good state.

CREATE TABLE IF NOT EXISTS realm_snapshots (
    id          SERIAL       PRIMARY KEY,
    realm       VARCHAR(200) NOT NULL,
    label       VARCHAR(500),
    snapshot    JSONB        NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT now(),
    created_by  VARCHAR(200) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_realm_snapshots_realm
    ON realm_snapshots (realm, created_at DESC);
