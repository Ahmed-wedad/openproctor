// server/src/routes/session.ts
// POST /api/session/start -> register a proctoring session (called by TAO glue layer)
// POST /api/session/finish -> finalize: flush Redis buffer to Postgres immediately
import { Router } from 'express';
import { ensureSession, setSessionStatus } from '../db.js';
import { syncOnce } from '../sync.js';

export const sessionRouter = Router();

sessionRouter.post('/start', async (req, res) => {
    try {
        const { sessionId, tenantId } = req.body ?? {};
        if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
        await ensureSession(sessionId);
        return res.status(202).json({ started: sessionId });
    } catch (err) {
        console.error('[session] start error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});

sessionRouter.post('/finish', async (req, res) => {
    try {
        const { sessionId } = req.body ?? {};
        if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
        // Force an immediate Redis -> Postgres drain for this session.
        const { syncSession } = await import('../sync.js');
        await syncSession(sessionId);
        await setSessionStatus(sessionId, 'completed');
        return res.status(202).json({ finished: sessionId });
    } catch (err) {
        console.error('[session] finish error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});
