// server/src/routes/review.ts
// GET /api/sessions            -> list sessions (flagged first)
// GET /api/review/:sessionId   -> telemetry + violations + signed snapshot URLs
import { Router } from 'express';
import { pool } from '../db.js';
import { getPresignedUrl } from '../minio.js';

export const reviewRouter = Router();

reviewRouter.get('/sessions', async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, status, created_at, updated_at
             FROM sessions ORDER BY (status = 'flagged') DESC, updated_at DESC`,
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('[review] error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});

reviewRouter.get('/review/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [sessionId]);
        if (session.rows.length === 0) {
            return res.status(404).json({ error: 'session not found' });
        }
        const telemetry = await pool.query(
            `SELECT timestamp, issue, detail FROM telemetry_flags WHERE session_id = $1 ORDER BY timestamp ASC`,
            [sessionId],
        );
        const violations = await pool.query(
            `SELECT issue, first_flag_timestamp, created_at FROM violations WHERE session_id = $1 ORDER BY created_at ASC`,
            [sessionId],
        );
        const snapshots = await pool.query(
            `SELECT object_key, timestamp FROM snapshots WHERE session_id = $1 ORDER BY timestamp ASC`,
            [sessionId],
        );
        const snapshotUrls = await Promise.all(
            snapshots.rows.map(async (s: { timestamp: number; object_key: string }) => ({
                timestamp: s.timestamp,
                url: await getPresignedUrl(s.object_key),
            })),
        );

        return res.json({
            session: session.rows[0],
            telemetry: telemetry.rows,
            violations: violations.rows,
            snapshots: snapshotUrls,
        });
    } catch (err) {
        console.error('[review] error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});
