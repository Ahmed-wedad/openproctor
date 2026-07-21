// server/src/db.ts
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.dbUrl });

export async function initDb(): Promise<void> {
    await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        liveness_passed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS telemetry_flags (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        issue TEXT NOT NULL,
        detail JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_flags(session_id)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS violations (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        issue TEXT NOT NULL,
        first_flag_timestamp BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_violations_session ON violations(session_id)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS snapshots (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        url TEXT,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id)`);
}

export async function ensureSession(id: string): Promise<void> {
    await pool.query(
        `INSERT INTO sessions (id, status) VALUES ($1, 'active')
         ON CONFLICT (id) DO NOTHING`,
        [id],
    );
}

export async function setSessionStatus(id: string, status: string): Promise<void> {
    await pool.query(
        `UPDATE sessions SET status = $2, updated_at = now() WHERE id = $1`,
        [id, status],
    );
}

export async function setLivenessPassed(id: string, passed: boolean): Promise<void> {
    await pool.query(
        `UPDATE sessions SET liveness_passed = $2, updated_at = now() WHERE id = $1`,
        [id, passed],
    );
}

export async function isLivenessPassed(id: string): Promise<boolean> {
    const result = await pool.query(`SELECT liveness_passed FROM sessions WHERE id = $1`, [id]);
    return result.rows.length > 0 && result.rows[0].liveness_passed === true;
}
