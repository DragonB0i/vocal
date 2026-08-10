/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Request, Response } from 'express';
import { runWorkflowEngine, executeGraphQL } from './_shared/runner';

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

  // --- 1. AUTHORIZATION ---
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
    
    // We need the user's ID to check their role. We can't trust the client for user_id.
    // We parse the JWT payload without verifying signature since the API gateway already verified it, OR we can fetch `auth.users` with the user token.
    const token = authHeader.split(' ')[1];
    const payloadBase64 = token.split('.')[1];
    let userId = null;
    try {
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
      userId = payload['https://hasura.io/jwt/claims']?.['x-hasura-user-id'];
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Could not extract user ID from token' });
    }

    const membership = orgMembers.find((m: any) => m.user_id === userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
      return res.status(403).json({ error: 'Approval denied: Requires owner or editor role.' });
    }

    // --- 2. APPROVE THE STEP ---
    // Update the step run to completed and record the approver
    const approveMutation = `
      mutation ApproveStepRun($id: uuid!, $userId: uuid!) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {
          status: "completed",
          approved_by: $userId,
          approved_at: "now()",
          completed_at: "now()",
          output: { "approved": true }
        }) {
          id
        }
      }
    `;

    await executeGraphQL(graphqlUrl, adminSecret, approveMutation, { id: stepId, userId });

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
