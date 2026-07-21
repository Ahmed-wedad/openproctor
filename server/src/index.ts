// server/src/index.ts
import express from 'express';
import { config } from './config.js';
import { initDb } from './db.js';
import { ensureBucket } from './minio.js';
import { redis } from './redis.js';
import { startSyncWorker } from './sync.js';
import { telemetryRouter } from './routes/telemetry.js';
import { snapshotRouter } from './routes/snapshot.js';
import { reviewRouter } from './routes/review.js';
import { sessionRouter, getSessionConfig, postLiveness } from './routes/session.js';
import { ltiRouter } from './routes/lti.js';
import { requireSecret, requireSessionToken, requireActiveSessionToken } from './auth.js';

async function main(): Promise<void> {
    await initDb();
    try {
        await ensureBucket();
    } catch (err) {
        // MinIO is deferred in the TAO CE integration; snapshots are stored as
        // object keys in Postgres and served from a local volume instead.
        console.warn('[minio] bucket init skipped (MinIO not configured):', (err as Error).message);
    }

    const app = express();
    app.use(express.json({ limit: '1mb' }));

    app.get('/health', (_req, res) => res.json({ ok: true }));
    // Frontend plugin contract: GET /api/v1/session/:alias (no shared-secret
    // needed — it only returns the public session config + provisional token).
    app.get('/api/v1/session/:alias', getSessionConfig);
    // CANDIDATE graph liveness probe: provisional sessionToken -> promoted active token.
    app.post('/api/v1/session/:alias/liveness', requireSessionToken, postLiveness);
    // LTI 1.3 Proctoring Tool endpoints (TAO Platform -> OpenProctor Tool).
    app.use('/lti', ltiRouter);
    // Privileged graph: service-to-service / proctor / admin.
    app.use('/api/session', requireSecret, sessionRouter);
    app.use('/api/telemetry', requireSecret, telemetryRouter);
    app.use('/api/snapshot', requireSecret, snapshotRouter);
    app.use('/api', reviewRouter);
    // CANDIDATE graph: telemetry/snapshot authenticated by an ACTIVE sessionToken
    // (issued after liveness passes). The liveness probe itself uses the provisional
    // token via POST /api/v1/session/:alias/liveness (mounted on sessionRouter).
    app.use('/api/v1/telemetry', requireActiveSessionToken, telemetryRouter);
    app.use('/api/v1/snapshot', requireActiveSessionToken, snapshotRouter);

    // Start the Redis -> Postgres bulk-sync worker.
    startSyncWorker();

    app.listen(config.port, () => {
        console.log(`OpenProctor microservice listening on :${config.port}`);
    });
}

main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    redis.quit();
    process.exit(0);
});
