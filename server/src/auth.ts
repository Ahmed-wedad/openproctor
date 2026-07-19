// server/src/auth.ts
// Shared-secret auth: the TAO glue layer (apps/openproctor) presents the secret in the
// `X-OpenProctor-Secret` header (or `?secret=` query) to authenticate to this API.
import { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

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
