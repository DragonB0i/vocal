/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Request, Response } from 'express';
import { runWorkflowEngine, executeGraphQL } from './_shared/runner';
import { checkRateLimit, getAuthenticatedUserId } from './_shared/security';

export default async function handleApproveStep(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { runId, stepId } = req.body;
  if (!runId || !stepId) {
    return res.status(400).json({ error: 'runId and stepId are required' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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

  // Query using the USER token to verify they have access to this org, and get their role.
  const checkAccessQuery = `
    query CheckApprovalAccess($runId: uuid!, $stepId: uuid!) {
      step_runs(where: {id: {_eq: $stepId}, workflow_run_id: {_eq: $runId}}) {
        id
        status
        workflow_run {
          status
          workflow {
            org_id
            organization {
              org_members {
                role
                user_id
              }
            }
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
      body: JSON.stringify({ query: checkAccessQuery, variables: { runId, stepId } })
    });

    const accessData: any = await accessResponse.json();
    if (accessData.errors) {
      return res.status(400).json({ error: 'GraphQL error checking access' });
    }

    const stepRuns = accessData.data?.step_runs;
    if (!stepRuns || stepRuns.length === 0) {
      return res.status(404).json({ error: 'Step run not found or access denied.' });
    }

    const stepRun = stepRuns[0];

    if (stepRun.status !== 'paused') {
      return res.status(400).json({ error: 'Step is not paused.' });
    }

    const orgMembers = stepRun.workflow_run.workflow.organization.org_members;
    
    const membership = orgMembers.find((m: any) => m.user_id === userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
      return res.status(403).json({ error: 'Approval denied: Requires owner or editor role.' });
    }

    // --- 2. APPROVE THE STEP (ATOMIC UPDATE) ---
    // Use an atomic update where status = "paused" to prevent concurrent duplicate approvals
    const approveMutation = `
      mutation ApproveStepRun($id: uuid!, $userId: uuid!) {
        update_step_runs(where: {id: {_eq: $id}, status: {_eq: "paused"}}, _set: {
          status: "completed",
          approved_by: $userId,
          approved_at: "now()",
          completed_at: "now()",
          output: { "approved": true }
        }) {
          affected_rows
        }
      }
    `;

    const mutationRes = await executeGraphQL(graphqlUrl, adminSecret, approveMutation, { id: stepId, userId });
    
    if (mutationRes.update_step_runs.affected_rows === 0) {
      return res.status(409).json({ error: 'Conflict: Step was already approved or is no longer paused.' });
    }

    // --- 3. RESUME WORKFLOW RUN ---
    const orgId = stepRun.workflow_run.workflow.org_id;
    const workflowId = stepRun.workflow_run.workflow.id;

    // Call runner with existingRunId
    const { status: finalStatus } = await runWorkflowEngine(
      graphqlUrl,
      adminSecret,
      workflowId,
      orgId,
      userId,
      null, // triggerContext
      runId // existingRunId
    );

    return res.status(200).json({ runId, stepId, status: finalStatus });

  } catch (error: any) {
    console.error('Unhandled approval error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
