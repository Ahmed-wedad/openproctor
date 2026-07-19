// server/src/routes/telemetry.ts
// POST /api/telemetry  -> buffer flags in Redis (write-behind to Postgres via sync worker)
import { Router } from 'express';
import { ensureSession } from '../db.js';
import {
    pushTelemetry,
    pushViolation,
    setRedisSessionStatus,
} from '../redis.js';
import { config } from '../config.js';

export const telemetryRouter = Router();

telemetryRouter.post('/', async (req, res) => {
    try {
        const { sessionId, flags } = req.body ?? {};
        if (!sessionId || !Array.isArray(flags) || flags.length === 0) {
            return res.status(400).json({ error: 'sessionId and non-empty flags[] required' });
        }
        await ensureSession(sessionId);

        let consecutive = 0;
        for (const flag of flags) {
            if (!flag || typeof flag.issue !== 'string') continue;
            await pushTelemetry(sessionId, {
                timestamp: flag.timestamp ?? Date.now(),
                issue: flag.issue,
                detail: flag.detail ?? null,
            });
            // Consecutive-violation detection against the incoming batch.
            if (isViolation(flag.issue)) {
                consecutive++;
            } else {
                consecutive = 0;
            }
            if (consecutive >= config.consecutiveViolationsThreshold) {
                await pushViolation(sessionId, {
                    issue: flag.issue,
                    timestamp: flag.timestamp ?? Date.now(),
                });
                await setRedisSessionStatus(sessionId, 'flagged');
                consecutive = 0; // reset after flagging
            }
        }

        return res.status(202).json({ accepted: flags.length });
    } catch (err) {
        console.error('[telemetry] error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});

function isViolation(issue: string): boolean {
    const ok = [
        'face_not_detected',
        'multiple_faces',
        'gaze_deviation',
        'no_movement',
        'excessive_movement',
        'page_blur',
        'window_resize',
        'copy',
        'cut',
        'paste',
        'tab_switch',
    ];
    return ok.includes(issue);
}
