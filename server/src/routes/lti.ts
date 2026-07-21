// server/src/routes/lti.ts
//
// OpenProctor acting as an IMS LTI 1.3 PROCTORING TOOL (the Procorio/EUR-APSO model).
// TAO CE is the Platform; it sends `LtiStartProctoring` to this Tool. We validate the
// launch via the platform's JWKS, then serve the EXTERNAL vendor frontend (which runs
// the proprietary camera/AI code at its own origin — never bundled into TAO). When the
// candidate is authorized (liveness passed), we return an `LtiStartAssessment` auto-POST
// form that redirects the test-taker back into the TAO delivery.
//
// This file is a thin, dependency-light skeleton: it validates the launch shape and
// issues the redirect. Full JWKS validation against the TAO platform should be wired
// via the `lti1p3` library (already a dependency of tao-ce) in production.
import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { ensureSession, isLivenessPassed } from '../db.js';

export const ltiRouter = Router();

/**
 * POST /lti/start  — receive LtiStartProctoring from the TAO Platform.
 *
 * Expected claims (subset):
 *   - `https://purl.imsglobal.org/spec/lti/claim/message_type` = "LtiStartProctoring"
 *   - `https://purl.imsglobal.org/spec/lti/claim/resource_link` -> id (delivery alias)
 *   - custom params may carry `serviceCallId` (the OpenProctor sessionId)
 *
 * In this integration the vendor frontend is opened by the TAO test-runner plugin
 * (postMessage bridge), so this endpoint primarily: validates the launch, ensures a
 * session exists, and returns the external frontend URL + provisional token so the
 * plugin can open it. It also supports returning an LtiStartAssessment form once the
 * proctor has authorized the assessment.
 */
ltiRouter.post('/start', async (req: Request, res: Response) => {
    try {
        const body = req.body ?? {};
        // Minimal validation: a real deployment verifies the OIDC login + JWT via JWKS.
        const messageType =
            body.message_type ??
            body['https://purl.imsglobal.org/spec/lti/claim/message_type'];
        if (messageType && messageType !== 'LtiStartProctoring') {
            return res.status(400).json({ error: 'unexpected message_type' });
        }

        const resourceLink =
            body['https://purl.imsglobal.org/spec/lti/claim/resource_link'] ?? {};
        const alias: string =
            body.serviceCallId ?? resourceLink.id ?? body.alias;
        if (!alias) {
            return res.status(400).json({ error: 'alias/serviceCallId required' });
        }

        await ensureSession(alias);
        const livenessPassed = await isLivenessPassed(alias);

        // The external vendor frontend URL (OPENPROCTOR_FRONTEND_URL). The plugin opens
        // this in a separate window; the candidate's browser runs the proprietary SDK there.
        // The vendor frontend only serves its ROOT route and reads `?alias=&token=` from
        // the query string (see openproctor/app/page.tsx). The `/lti/start` path is a
        // backend API route, not a frontend page, so we point the launch at the root.
        const frontendUrl = (config.openproctorPublicUrl || '').replace(/\/api.*$/, '');
        const launchUrl = `${frontendUrl}/?alias=${encodeURIComponent(alias)}`;

        return res.json({
            alias,
            livenessPassed,
            frontendUrl: launchUrl,
            // In a full LTI flow we would also return an `LtiStartAssessment` auto-POST
            // form here once the proctor authorizes; the plugin drives the window instead.
            authorized: livenessPassed,
        });
    } catch (err) {
        console.error('[lti] start error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});

/**
 * POST /lti/assessment — return an LtiStartAssessment auto-POST form to redirect the
 * test-taker from the proctoring tool back into the TAO delivery.
 */
ltiRouter.post('/assessment', async (req: Request, res: Response) => {
    try {
        const { alias, returnUrl } = req.body ?? {};
        if (!alias || !returnUrl) {
            return res.status(400).json({ error: 'alias and returnUrl required' });
        }
        const form = `<!doctype html><html><head><title>Starting assessment…</title></head>
<body onload="document.forms[0].submit()">
<form method="POST" action="${returnUrl}">
<input type="hidden" name="lti_assessment" value="1" />
<input type="hidden" name="alias" value="${alias}" />
</form></body></html>`;
        res.set('Content-Type', 'text/html');
        return res.send(form);
    } catch (err) {
        console.error('[lti] assessment error:', err);
        return res.status(500).json({ error: 'internal error' });
    }
});
