// server/src/config.ts
import 'dotenv/config';

export const config = {
    port: Number(process.env.PORT ?? 4000),
    dbUrl: process.env.DB_URL ?? 'postgres://openproctor:openproctor@localhost:5432/openproctor',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    apiSecret: process.env.OPENPROCTOR_API_SECRET ?? '',
    minio: {
        endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
        port: Number(process.env.MINIO_PORT ?? 9000),
        useSSL: (process.env.MINIO_USE_SSL ?? 'false') === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
        bucket: process.env.MINIO_BUCKET ?? 'openproctor-snapshots',
    },
    consecutiveViolationsThreshold: Number(process.env.CONSECUTIVE_VIOLATIONS_THRESHOLD ?? 5),
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 5000),
    syncBatchSize: Number(process.env.SYNC_BATCH_SIZE ?? 200),
};
