/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Request, Response } from 'express';
import { executeGraphQL } from './_shared/runner';
import crypto from 'crypto';

export default async function handler(req: Request, res: Response) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

    const token = authHeader.replace('Bearer ', '');
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) throw new Error('Invalid token');
    const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const payload = JSON.parse(payloadStr);
    const userId = payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing user ID in token' });
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
