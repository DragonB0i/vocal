/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { runWorkflowEngine } from './_shared/runner';
import { checkRateLimit, checkIdempotency, getAuthenticatedUserId } from './_shared/security';

export default async function handler(req: Request, res: Response) {
  // CORS handling
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

  // --- 0. RATE LIMITING & IDEMPOTENCY ---
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(String(clientIp), 30)) {
    return res.status(429).json({ error: 'Too Many Requests' });
  }

  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (idempotencyKey && !checkIdempotency(`exec:${idempotencyKey}`)) {
    return res.status(409).json({ error: 'Duplicate execution request' });
  }

  // --- 1. AUTHORIZATION ---
  const userId = await getAuthenticatedUserId(graphqlUrl, authHeader);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing user token' });
  }

  // We query the workflow using the USER's token. This ensures they at least belong to the org.
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

  try {
    const accessResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        query: checkAccessQuery,
        variables: { id: workflowId }
      })
    });

    const accessData = await accessResponse.json();
    
    if (accessData.errors) {
      console.error('GraphQL Error checking access:', accessData.errors);
      return res.status(400).json({ error: 'Failed to verify workflow access' });
    }

    const workflow = accessData.data?.workflows_by_pk;
    if (!workflow) {
      return res.status(403).json({ error: 'Workflow not found or access denied' });
    }

    const membership = workflow.organization.org_members.find((m: any) => m.user_id === userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
      return res.status(403).json({ error: 'Execution denied: Requires owner or editor role in this organization.' });
    }

    // Prevent identical workflow concurrent clicks by using workflowId idempotency if no key provided
    if (!idempotencyKey && !checkIdempotency(`exec-wf:${userId}:${workflowId}`)) {
       return res.status(409).json({ error: 'Execution already in progress. Please wait.' });
    }

    // --- 2. EXECUTE WORKFLOW ---
    const { runId, status } = await runWorkflowEngine(
      graphqlUrl,
      adminSecret,
      workflowId,
      workflow.org_id,
      userId
    );

    return res.status(200).json({ runId, status });

  } catch (error: any) {
    console.error('Unhandled execution error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
