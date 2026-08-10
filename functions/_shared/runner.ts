/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
export async function runWorkflowEngine(
  graphqlUrl: string, 
  adminSecret: string, 
  workflowId: string, 
  orgId: string, 
  userId: string | null,
  triggerContext: any = null
) {
  // 1. Initialize Run
  const initQuery = `
    mutation InitExecution($workflowId: uuid!, $orgId: uuid!, $userId: uuid) {
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
    orgId,
    userId
  });

  const runId = initData.insert_workflow_runs_one.id;

  // 2. Fetch steps
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

  // 3. Execute steps sequentially
  for (const step of steps) {
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
        const url = new URL(step.config.url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('SSRF Protection: Only http and https protocols are allowed');
        }
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('169.254') || url.hostname === '0.0.0.0') {
          throw new Error('SSRF Protection: Invalid hostname');
        }
        if (/(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(url.hostname)) {
          throw new Error('SSRF Protection: Private IP ranges are restricted');
        }

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
          body: responseText.substring(0, 5000)
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
          orgId,
          runId,
          message: step.config.message || `Notification from step: ${step.name}`
        });
        stepOutput = { success: true };
      } else {
        throw new Error(`Unsupported step type: ${step.type}`);
      }
    } catch (err: any) {
      stepStatus = 'failed';
      stepError = { message: err.message || 'Unknown error' };
      hasFailure = true;
    }

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
      break;
    }
  }

  // 4. Finalize run
  const finalStatus = hasFailure ? 'failed' : 'completed';
  const finalizeRunQuery = `
    mutation FinalizeRun($id: uuid!, $status: String!, $orgId: uuid!, $userId: uuid) {
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
    orgId,
    userId
  });

  return { runId, status: finalStatus };
}

export async function executeGraphQL(url: string, adminSecret: string, query: string, variables: any = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({ query, variables })
  });

  const json: any = await response.json();
  if (json.errors) {
    throw new Error('GraphQL Error: ' + JSON.stringify(json.errors));
  }
  return json.data;
}
