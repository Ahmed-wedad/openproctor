// server/src/minio.ts
import * as Minio from 'minio';
import { config } from './config.js';

export const minioClient = new Minio.Client({
    endPoint: config.minio.endPoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
});

export async function ensureBucket(): Promise<void> {
    const exists = await minioClient.bucketExists(config.minio.bucket);
    if (!exists) {
        await minioClient.makeBucket(config.minio.bucket);
    }
}

export async function putObject(key: string, data: Buffer, contentType: string): Promise<void> {
    await minioClient.putObject(config.minio.bucket, key, data, data.length, {
        'Content-Type': contentType,
    });
}

export async function getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    return minioClient.presignedGetObject(config.minio.bucket, key, expirySeconds);
}
