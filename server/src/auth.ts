// server/src/auth.ts
//
// TWO DISJOINT AUTH GRAPHS (see plan 1E):
//   1. CANDIDATE graph — zero-friction, account-less. A per-session opaque signed
//      JWT (`sessionToken`, HMAC) is issued by GET /api/v1/session/:alias and used by
//      the candidate's browser to POST telemetry/snapshots. The candidate NEVER holds
//      the service shared secret.
//   2. PRIVILEGED graph — proctor/admin/review + service-to-service. Uses the
//      `X-OpenProctor-Secret` header (requireSecret) or a proctor JWT.
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from './config.js';

/**
 * Service-to-service / proctor / admin auth (PRIVILEGED graph).
 * The TAO glue layer (apps/openproctor) presents the secret in the
 * `X-OpenProctor-Secret` header (or `?secret=` query) to authenticate to this API.
 */
export function requireSecret(req: Request, res: Response, next: NextFunction): void {
    if (!config.apiSecret) {
        // Auth disabled when no secret configured (dev only).
        return next();
    }
    const provided =
        (req.header('X-OpenProctor-Secret') as string | undefined) ??
        (req.query.secret as string | undefined);
    if (provided !== config.apiSecret) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    return next();
}

// --- Candidate session-token (HMAC-signed, opaque) -------------------------------

function base64url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function sign(payloadB64: string): string {
    return base64url(
        crypto.createHmac('sha256', config.sessionTokenSecret).update(payloadB64).digest(),
    );
}

/**
 * Issue a short-lived, opaque, HMAC-signed session token scoped to a session.
 * @param sessionId - delivery execution alias (also the OpenProctor sessionId)
 * @param provisional - true => token usable only for the liveness probe; false => active
 */
export function issueSessionToken(sessionId: string, provisional = true): string {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'op-session' }));
    const now = Math.floor(Date.now() / 1000);
    const payload = base64url(
        JSON.stringify({
            sid: sessionId,
            prov: provisional ? 1 : 0,
            iat: now,
            exp: now + config.sessionTokenTtl,
        }),
    );
    const body = `${header}.${payload}`;
    return `${body}.${sign(body)}`;
}

/**
 * Verify a candidate session token. Returns the decoded claims or null.
 * @param token
 * @param requireActive - if true, reject provisional tokens (used after liveness passed)
 */
export function verifySessionToken(
    token: string | undefined,
    requireActive = false,
): { sid: string; prov: number } | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = sign(`${header}.${payload}`);
    // constant-time compare
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    let claims: any;
    try {
        claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch {
        return null;
    }
    if (typeof claims.exp === 'number' && claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (requireActive && claims.prov === 1) return null;
    return { sid: claims.sid, prov: claims.prov };
}

/**
 * Candidate auth middleware: requires a valid session token (provisional OK).
 * Attaches req.sessionId. Used by the liveness probe endpoint.
 */
export function requireSessionToken(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const token =
        (req.header('X-OpenProctor-Session-Token') as string | undefined) ??
        (req.query.token as string | undefined) ??
        (req.body && (req.body as any).token);
    const claims = verifySessionToken(token);
    if (!claims) {
        res.status(401).json({ error: 'invalid or expired session token' });
        return;
    }
    (req as any).sessionId = claims.sid;
    (req as any).sessionProvisional = claims.prov === 1;
    return next();
}

/**
 * Candidate auth middleware: requires an ACTIVE (liveness-passed) session token.
 * Used by telemetry/snapshot candidate endpoints so raw telemetry is only accepted
 * after the candidate has passed the initial liveness gate.
 */
export function requireActiveSessionToken(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const token =
        (req.header('X-OpenProctor-Session-Token') as string | undefined) ??
        (req.query.token as string | undefined) ??
        (req.body && (req.body as any).token);
    const claims = verifySessionToken(token, true);
    if (!claims) {
        res.status(401).json({ error: 'active session token required (pass liveness first)' });
        return;
    }
    (req as any).sessionId = claims.sid;
    (req as any).sessionProvisional = false;
    return next();
}
