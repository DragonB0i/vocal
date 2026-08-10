/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';

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

  // --- 1. AUTHORIZATION ---
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

    // Determine the user's role. Nhost JWT doesn't give us the precise user ID easily in an edge function without verifying JWT manually.
    // However, the GraphQL query was executed under their identity. The `org_members` array returned 
    // will ONLY contain their own membership if row-level security isolates it, or all memberships if they can see all.
    // In Phase 2, users can read all org_members in their organization. So we need their user ID.
    // We can fetch the user ID from the Hasura JWT endpoints or from Nhost Auth `/v1/auth/user`.
    // An easier Hasura trick: `query { auth_users { id } }` might return their user ID if they have access to their own record.
    // But let's verify via the auth endpoint or decode the JWT safely.
    // Actually, we can just ask Hasura to return the current user's ID by calling a custom action or using `x-hasura-user-id`? 
    // We can decode the JWT payload! The JWT is not encrypted, just base64 encoded.
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
    if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
      return res.status(403).json({ error: 'Execution denied: Requires owner or editor role in this organization.' });
    }

    // --- 2. FETCH STEPS & INITIALIZE RUN (WITH ADMIN PRIVILEGES) ---
    // Now we use the admin secret to orchestrate the execution.
    const initQuery = `
      mutation InitExecution($workflowId: uuid!, $orgId: uuid!, $userId: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          status: "running",
          started_at: "now()"
        }) {
          id
        }
        insert_audit_logs_one(object: {
          org_id: $orgId,
          user_id: $userId,
          action: "workflow_started",
          entity_type: "workflow_run",
          entity_id: $workflowId
        }) {
          id
        }
      }
    `;

    const initData = await executeGraphQL(graphqlUrl, adminSecret, initQuery, {
      workflowId,
      orgId: workflow.org_id,
      userId
    });

    const runId = initData.insert_workflow_runs_one.id;

    // We don't block the frontend while it executes. We can run it asynchronously in background, or await it if it's fast.
    // For Vercel/Nhost serverless, returning early might kill the function, so we must await it.
    // If it takes too long, we might hit a timeout. For now, we await it.
    
    // Fetch steps
    const stepsQuery = `
      query GetSteps($workflowId: uuid!) {
        workflow_steps(where: {workflow_id: {_eq: $workflowId}}, order_by: {position: asc}) {
          id
          name
          type
          config
        }
      }
    `;
    const stepsData = await executeGraphQL(graphqlUrl, adminSecret, stepsQuery, { workflowId });
    const steps = stepsData.workflow_steps;

    let hasFailure = false;

    // --- 3. EXECUTE STEPS SEQUENTIALLY ---
    for (const step of steps) {
      // Create step_run
      const createStepRunQuery = `
        mutation CreateStepRun($runId: uuid!, $stepId: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $runId,
            workflow_step_id: $stepId,
            status: "running",
            started_at: "now()"
          }) {
            id
          }
        }
      `;
      const stepRunData = await executeGraphQL(graphqlUrl, adminSecret, createStepRunQuery, {
        runId,
        stepId: step.id
      });
      const stepRunId = stepRunData.insert_step_runs_one.id;

      let stepStatus = 'completed';
      let stepOutput = null;
      let stepError = null;

      try {
        if (step.type === 'http_request') {
          // Validate SSRF
          const url = new URL(step.config.url);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('SSRF Protection: Only http and https protocols are allowed');
          }
          if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('169.254') || url.hostname === '0.0.0.0') {
            throw new Error('SSRF Protection: Invalid hostname');
          }
          // Simple block for RFC1918 10.x.x.x, 192.168.x.x, 172.16.x.x is tricky with just regex on hostname, but we'll do basic checks
          if (/(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(url.hostname)) {
            throw new Error('SSRF Protection: Private IP ranges are restricted');
          }

          // Execute with timeout
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          
          const method = step.config.method || 'GET';
          const fetchOptions: any = { method, signal: controller.signal };
          if (step.config.body && (method === 'POST' || method === 'PUT')) {
            fetchOptions.body = JSON.stringify(step.config.body);
            fetchOptions.headers = { 'Content-Type': 'application/json' };
          }

          const res = await fetch(url.toString(), fetchOptions);
          clearTimeout(timeout);
          
          const responseText = await res.text();
          stepOutput = {
            status: res.status,
            body: responseText.substring(0, 5000) // limit size
          };
          if (!res.ok) {
            throw new Error(`HTTP Error: ${res.status}`);
          }
        } else if (step.type === 'notify') {
          const notifyQuery = `
            mutation CreateNotification($orgId: uuid!, $runId: uuid!, $message: String!) {
              insert_notifications_one(object: {
                org_id: $orgId,
                workflow_run_id: $runId,
                title: "Workflow Notification",
                message: $message,
                type: "workflow_event"
              }) {
                id
              }
            }
          `;
          await executeGraphQL(graphqlUrl, adminSecret, notifyQuery, {
            orgId: workflow.org_id,
            runId,
            message: step.config.message || `Notification from step: ${step.name}`
          });
          stepOutput = { success: true };
        } else {
          // Unsupported types
          throw new Error(`Unsupported step type: ${step.type}`);
        }
      } catch (err: any) {
        stepStatus = 'failed';
        stepError = { message: err.message || 'Unknown error' };
        hasFailure = true;
      }

      // Finalize step_run
      const finalizeStepQuery = `
        mutation FinalizeStepRun($id: uuid!, $status: String!, $output: jsonb, $error: jsonb) {
          update_step_runs_by_pk(pk_columns: {id: $id}, _set: {
            status: $status,
            output: $output,
            error: $error,
            completed_at: "now()"
          }) {
            id
          }
        }
      `;
      await executeGraphQL(graphqlUrl, adminSecret, finalizeStepQuery, {
        id: stepRunId,
        status: stepStatus,
        output: stepOutput,
        error: stepError
      });

      if (hasFailure) {
        // Stop sequential execution
        break;
      }
    }

    // --- 4. FINALIZE RUN ---
    const finalStatus = hasFailure ? 'failed' : 'completed';
    const finalizeRunQuery = `
      mutation FinalizeRun($id: uuid!, $status: String!, $orgId: uuid!, $userId: uuid!) {
        update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {
          status: $status,
          completed_at: "now()"
        }) {
          id
        }
        insert_audit_logs_one(object: {
          org_id: $orgId,
          user_id: $userId,
          action: $status,
          entity_type: "workflow_run",
          entity_id: $id
        }) {
          id
        }
      }
    `;
    await executeGraphQL(graphqlUrl, adminSecret, finalizeRunQuery, {
      id: runId,
      status: finalStatus,
      orgId: workflow.org_id,
      userId
    });

    return res.status(200).json({ runId, status: finalStatus });

  } catch (error: any) {
    console.error('Unhandled execution error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function executeGraphQL(url: string, adminSecret: string, query: string, variables: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error('GraphQL Error: ' + JSON.stringify(json.errors));
  }
  return json.data;
}
