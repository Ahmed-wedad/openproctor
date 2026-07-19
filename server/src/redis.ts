// server/src/redis.ts
// Redis acts as a write-behind cache between the ingest endpoint and PostgreSQL.
// Telemetry flags are buffered here and bulk-synced to Postgres by sync.ts.
import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });

// Key helpers
export const telemetryKey = (sessionId: string) => `telemetry:${sessionId}`;
export const violationsKey = (sessionId: string) => `violations:${sessionId}`;
export const sessionStatusKey = (sessionId: string) => `sessions:${sessionId}:status`;

// Push a single telemetry flag (JSON) onto the session's list.
export async function pushTelemetry(sessionId: string, flag: object): Promise<void> {
    await redis.rpush(telemetryKey(sessionId), JSON.stringify(flag));
}

// Push a violation record (JSON) onto the session's violation list.
export async function pushViolation(sessionId: string, violation: object): Promise<void> {
    await redis.rpush(violationsKey(sessionId), JSON.stringify(violation));
}

// Set the in-Redis session status (mirrored to Postgres on sync).
export async function setRedisSessionStatus(sessionId: string, status: string): Promise<void> {
    await redis.set(sessionStatusKey(sessionId), status);
}

// Drain a session's telemetry list (returns and deletes up to `count` items).
export async function drainTelemetry(sessionId: string, count: number): Promise<any[]> {
    const key = telemetryKey(sessionId);
    const items = await redis.lrange(key, 0, count - 1);
    if (items.length > 0) await redis.ltrim(key, items.length, -1);
    return items.map((i) => JSON.parse(i));
}

// Drain a session's violation list.
export async function drainViolations(sessionId: string, count: number): Promise<any[]> {
    const key = violationsKey(sessionId);
    const items = await redis.lrange(key, 0, count - 1);
    if (items.length > 0) await redis.ltrim(key, items.length, -1);
    return items.map((i) => JSON.parse(i));
}

// List all session ids that currently have buffered telemetry.
export async function activeTelemetrySessions(): Promise<string[]> {
    const keys = await redis.keys('telemetry:*');
    return keys.map((k) => k.replace('telemetry:', ''));
}
