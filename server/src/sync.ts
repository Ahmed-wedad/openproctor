// server/src/sync.ts
// Bulk-sync worker: drains Redis buffers and writes them to PostgreSQL in batches.
// This is the write-behind boundary between Redis and Postgres.
import { pool, setSessionStatus } from './db.js';
import {
    activeTelemetrySessions,
    drainTelemetry,
    drainViolations,
    sessionStatusKey,
} from './redis.js';
import { config } from './config.js';
import { redis } from './redis.js';

export async function syncOnce(): Promise<void> {
    const sessions = await activeTelemetrySessions();
    for (const sessionId of sessions) {
        await syncSession(sessionId);
    }
}

export async function syncSession(sessionId: string): Promise<void> {
    // Telemetry flags
    let flags = await drainTelemetry(sessionId, config.syncBatchSize);
    while (flags.length > 0) {
        await insertTelemetryBatch(sessionId, flags);
        flags = await drainTelemetry(sessionId, config.syncBatchSize);
    }

    // Violations
    let violations = await drainViolations(sessionId, config.syncBatchSize);
    while (violations.length > 0) {
        await insertViolationsBatch(sessionId, violations);
        violations = await drainViolations(sessionId, config.syncBatchSize);
    }

    // Mirror session status to Postgres if flagged in Redis
    const status = await redis.get(sessionStatusKey(sessionId));
    if (status) {
        await setSessionStatus(sessionId, status);
    }
}

async function insertTelemetryBatch(sessionId: string, flags: any[]): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const f of flags) {
            await client.query(
                `INSERT INTO telemetry_flags (session_id, timestamp, issue, detail)
                 VALUES ($1, $2, $3, $4)`,
                [sessionId, f.timestamp, f.issue, f.detail ?? null],
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function insertViolationsBatch(sessionId: string, violations: any[]): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const v of violations) {
            await client.query(
                `INSERT INTO violations (session_id, issue, first_flag_timestamp)
                 VALUES ($1, $2, $3)`,
                [sessionId, v.issue, v.timestamp],
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export function startSyncWorker(): NodeJS.Timeout {
    return setInterval(() => {
        syncOnce().catch((err) => console.error('[sync] error:', err));
    }, config.syncIntervalMs);
}
