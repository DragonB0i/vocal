/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Request, Response } from 'express';
import { executeGraphQL } from './_shared/runner';
import { checkRateLimit, getAuthenticatedUserId } from './_shared/security';
import crypto from 'crypto';

export default async function handler(req: Request, res: Response) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { workflowId } = req.body;
  if (!workflowId) {
    return res.status(400).json({ error: 'workflowId is required' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: missing authorization header' });
  }

  const graphqlUrl = process.env.NHOST_GRAPHQL_URL;
  const adminSecret = process.env.NHOST_ADMIN_SECRET;

  if (!graphqlUrl || !adminSecret) {
    console.error('Missing NHOST_GRAPHQL_URL or NHOST_ADMIN_SECRET');
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  // --- 0. RATE LIMITING ---
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(String(clientIp), 30)) {
    return res.status(429).json({ error: 'Too Many Requests' });
  }

  // --- 1. AUTHORIZATION ---
  const userId = await getAuthenticatedUserId(graphqlUrl, authHeader);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing user token' });
  }

  try {
    // 1. Check access
    const checkAccessQuery = `
      query CheckWorkflowAccess($id: uuid!) {
        workflows_by_pk(id: $id) {
          id
          org_id
          organization {
            org_members {
              role
              user_id
            }
          }
        }
      }
    `;

    const accessResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ query: checkAccessQuery, variables: { id: workflowId } })
    });

    const accessData = await accessResponse.json();
    const workflow = accessData.data?.workflows_by_pk;
    if (!workflow) {
      return res.status(403).json({ error: 'Workflow not found or access denied' });
    }

    const membership = workflow.organization.org_members.find((m: any) => m.user_id === userId);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error: 'Requires owner role to create a webhook trigger' });
    }

    // 2. Generate secret and hash
    const plaintextSecret = 'whsec_' + crypto.randomBytes(32).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(plaintextSecret, salt, 64);
    const secretHash = `${salt}:${derivedKey.toString('base64')}`;

    // 3. Create Trigger
    const insertQuery = `
      mutation CreateWebhook($workflowId: uuid!, $secretHash: String!, $orgId: uuid!, $userId: uuid!) {
        insert_workflow_triggers_one(object: {
          workflow_id: $workflowId,
          type: "webhook",
          secret_hash: $secretHash,
          enabled: true
        }) {
          id
        }
        insert_audit_logs_one(object: {
          org_id: $orgId,
          user_id: $userId,
          action: "webhook_trigger_created",
          entity_type: "workflow_trigger",
          entity_id: $workflowId
        }) {
          id
        }
      }
    `;

    const insertData = await executeGraphQL(graphqlUrl, adminSecret, insertQuery, {
      workflowId,
      secretHash,
      orgId: workflow.org_id,
      userId
    });

    const triggerId = insertData.insert_workflow_triggers_one.id;

    // Return the plaintext secret EXACTLY ONCE
    return res.status(200).json({ triggerId, secret: plaintextSecret });

  } catch (error: any) {
    console.error('Unhandled execution error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
