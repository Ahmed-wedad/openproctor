-- OpenProctor microservice schema
-- Run with: psql "$DB_URL" -f src/schema.sql

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry_flags (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    issue TEXT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_flags(session_id);

CREATE TABLE IF NOT EXISTS violations (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    issue TEXT NOT NULL,
    first_flag_timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_violations_session ON violations(session_id);

CREATE TABLE IF NOT EXISTS snapshots (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    object_key TEXT NOT NULL,
    url TEXT,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
