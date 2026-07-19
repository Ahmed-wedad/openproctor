// server/src/routes/snapshot.ts
// POST /api/snapshot -> store uploaded image/clip in MinIO, record metadata in Postgres.
import { Router } from 'express';
import multer from 'multer';
import { ensureSession, pool } from '../db.js';
import { putObject } from '../minio.js';
import { config } from '../config.js';

export const snapshotRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

snapshotRouter.post('/', upload.single('file'), async (req, res) => {
    try {
        const sessionId = req.body.sessionId;
        const timestamp = Number(req.body.timestamp ?? Date.now());
        if (!sessionId || !req.file) {
            return res.status(400).json({ error: 'sessionId and file required' });
        }
        await ensureSession(sessionId);

        const ext = req.file.mimetype.includes('image') ? 'jpg' : 'webm';
        const key = `${sessionId}/${timestamp}.${ext}`;
        await putObject(key, req.file.buffer, req.file.mimetype);

        const result = await pool.query(
            `INSERT INTO snapshots (session_id, object_key, timestamp)
             VALUES ($1, $2, $3) RETURNING id`,
            [sessionId, key, timestamp],
        );

        return res.status(201).json({ id: result.rows[0].id, objectKey: key });
    } catch (err) {
        console.error('[snapshot] error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});
