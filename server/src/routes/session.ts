// server/src/routes/session.ts
// POST /api/session/start -> register a proctoring session (called by TAO glue layer)
// POST /api/session/finish -> finalize: flush Redis buffer to Postgres immediately
// GET  /api/v1/session/:alias -> session config + provisional sessionToken (CANDIDATE graph)
// POST /api/v1/session/:alias/liveness -> candidate liveness attestation (CANDIDATE graph)
import { Router, type Request, type Response } from 'express';
import { ensureSession, setSessionStatus, setLivenessPassed, isLivenessPassed } from '../db.js';
import { syncOnce } from '../sync.js';
import { config } from '../config.js';
import { issueSessionToken, requireSessionToken, verifySessionToken } from '../auth.js';

export const sessionRouter = Router();

// Frontend plugin contract: GET /api/v1/session/{alias} returns the session
// config the browser plugin needs to launch the EXTERNAL vendor frontend, plus a
// PROVISIONAL sessionToken the candidate's browser uses to authenticate telemetry.
// `alias` is the delivery execution id (serviceCallId) = OpenProctor sessionId.
// Exported so it can be mounted at the exact absolute path the plugin calls.
export async function getSessionConfig(req: Request, res: Response): Promise<void> {
    try {
        const alias = req.params.alias;
        if (!alias) {
            res.status(400).json({ error: 'alias required' });
            return;
        }
        // Make sure a session row exists so telemetry/snapshots can be written.
        await ensureSession(alias);
        const livenessPassed = await isLivenessPassed(alias);
        res.json({
            sessionId: alias,
            microserviceUrl: config.openproctorPublicUrl || `http://openproctor-api:4000`,
            // Provisional token: usable for the liveness probe + telemetry until liveness
            // passes; promoted to active by POST /liveness. Never the service shared secret.
            sessionToken: issueSessionToken(alias, !livenessPassed),
            livenessPassed,
            features: {
                faceAnalytics: true,
                behaviorMonitoring: true,
                telemetry: true,
                liveness: true
            }
        });
        return;
    } catch (err) {
        console.error('[session] v1/session error:', err);
        res.status(500).json({ error: 'internal error' });
        return;
    }
}

sessionRouter.get('/v1/session/:alias', getSessionConfig);

// CANDIDATE graph: liveness attestation. The vendor frontend (EXTERNAL origin)
// computes liveness IN-BROWSER and POSTs a signed attestation (NOT raw video).
// On success we mark liveness_passed and promote the token to active.
// Exported so it can be mounted at the exact absolute path the vendor frontend
// calls: POST /api/v1/session/:alias/liveness (CANDIDATE graph, provisional token).
export const postLiveness = async (req: Request, res: Response): Promise<unknown> => {
    try {
        const alias = req.params.alias;
        // Token must belong to this alias.
        if ((req as any).sessionId !== alias) {
            return res.status(403).json({ error: 'token/session mismatch' });
        }
        const { attestation, passed } = req.body ?? {};
        // Attestation is produced by the SDK at the external origin; we verify its
        // shape/signature here. For now we accept a boolean `passed` gated by a
        // non-empty attestation payload (SDK signs this before sending).
        if (!attestation || typeof passed !== 'boolean') {
            return res.status(400).json({ error: 'attestation and passed required' });
        }
        if (passed) {
            await setLivenessPassed(alias, true);
            return res.json({
                livenessPassed: true,
                // Promote: issue an ACTIVE token (prov=0) for subsequent telemetry.
                sessionToken: issueSessionToken(alias, false),
            });
        }
        // Liveness failed: keep provisional, do not promote. Plain-language retry is
        // handled by the vendor frontend UI (no error codes shown to candidate).
        return res.status(200).json({ livenessPassed: false });
    } catch (err) {
        console.error('[session] liveness error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
};

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
