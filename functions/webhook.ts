/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Request, Response } from 'express';
import { runWorkflowEngine, executeGraphQL } from './_shared/runner';
import { checkRateLimit, checkIdempotency } from './_shared/security';
import crypto from 'crypto';

export default async function handler(req: Request, res: Response) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-webhook-secret'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Expect POST for webhooks typically, but we can allow GET if configured. We'll enforce POST for now.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const triggerId = req.query.triggerId;
  if (!triggerId || typeof triggerId !== 'string') {
    return res.status(400).json({ error: 'triggerId query parameter is required' });
  }

  let secret = req.headers['x-webhook-secret'] as string | undefined;
  if (!secret) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      secret = authHeader.substring(7);
    }
  }

  if (!secret) {
    return res.status(401).json({ error: 'Unauthorized: missing webhook secret' });
  }

  const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
  const adminSecret = process.env.NHOST_ADMIN_SECRET;

  if (!graphqlUrl || !adminSecret) {
    console.error('Missing NHOST_GRAPHQL_URL or NHOST_ADMIN_SECRET');
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  // --- 0. RATE LIMITING & IDEMPOTENCY ---
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(String(clientIp), 60)) {
    return res.status(429).json({ error: 'Too Many Requests' });
  }

  // Idempotency: Webhook providers often send an ID (e.g., github's x-github-delivery)
  const deliveryId = req.headers['x-webhook-delivery-id'] || req.headers['x-github-delivery'] || req.headers['stripe-signature'];
  if (deliveryId && !checkIdempotency(`wh:${triggerId}:${deliveryId}`)) {
    return res.status(200).json({ status: 'already_processed', message: 'Webhook delivery already processed' });
  }

  try {
    // 1. Fetch Trigger
    const triggerQuery = `
      query GetTrigger($id: uuid!) {
        workflow_triggers_by_pk(id: $id) {
          id
          workflow_id
          type
          enabled
          secret_hash
          workflow {
            org_id
            status
          }
        }
      }
    `;

    const triggerData = await executeGraphQL(graphqlUrl, adminSecret, triggerQuery, { id: triggerId });
    const trigger = triggerData.workflow_triggers_by_pk;

    // 2. Validate Trigger Exists and is Enabled
    if (!trigger || trigger.type !== 'webhook' || !trigger.enabled) {
      // Return 401 instead of 404 to avoid leaking existence, or return 401 if secret invalid.
      return res.status(401).json({ error: 'Unauthorized or invalid trigger' });
    }

    if (trigger.workflow.status !== 'active') {
      return res.status(403).json({ error: `Cannot execute workflow because it is ${trigger.workflow.status}` });
    }

    // 3. Verify Secret
    if (!trigger.secret_hash) {
      return res.status(401).json({ error: 'Unauthorized or invalid trigger' });
    }

    const [salt, hashBase64] = trigger.secret_hash.split(':');
    if (!salt || !hashBase64) {
      return res.status(401).json({ error: 'Unauthorized or invalid trigger' });
    }

    const derivedKey = crypto.scryptSync(secret, salt, 64);
    const expectedKey = Buffer.from(hashBase64, 'base64');
    
    // Constant time comparison to prevent timing attacks
    let match = false;
    try {
      match = crypto.timingSafeEqual(derivedKey, expectedKey);
    } catch (e) {
      match = false; // Length mismatch
    }

    if (!match) {
      return res.status(401).json({ error: 'Unauthorized or invalid trigger' });
    }

    // 4. Validate Payload Size
    const payloadStr = JSON.stringify(req.body || {});
    if (payloadStr.length > 512 * 1024) { // 512KB limit
      return res.status(413).json({ error: 'Payload Too Large' });
    }

    const payload = req.body;

    // Fallback Idempotency (if no delivery ID was provided, hash the payload + trigger to prevent double-processing within 5 mins)
    if (!deliveryId) {
      const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');
      if (!checkIdempotency(`wh-hash:${triggerId}:${payloadHash}`)) {
        return res.status(200).json({ status: 'already_processed', message: 'Identical payload recently processed' });
      }
    }

    // 5. Execute Workflow
    // Passing payload as triggerContext
    const { runId, status } = await runWorkflowEngine(
      graphqlUrl,
      adminSecret,
      trigger.workflow_id,
      trigger.workflow.org_id,
      null, // user_id is null for webhooks
      payload
    );

    return res.status(200).json({ runId, status });

  } catch (error: any) {
    console.error('Unhandled webhook error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
