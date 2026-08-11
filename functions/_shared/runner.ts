/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

// Helper to resolve property path like "steps.FetchData.output.title"
function resolveContextPath(context: any, path: string): any {
  if (!path || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let current = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

// Simple template interpolation (e.g. "Hello {{ steps.FetchData.output.name }}")
function interpolateString(template: string, context: any): string {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const val = resolveContextPath(context, path);
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function interpolateConfig(config: any, context: any): any {
  if (typeof config === 'string') {
    return interpolateString(config, context);
  } else if (Array.isArray(config)) {
    return config.map(item => interpolateConfig(item, context));
  } else if (config !== null && typeof config === 'object') {
    const newConfig: any = {};
    for (const [key, value] of Object.entries(config)) {
      newConfig[key] = interpolateConfig(value, context);
    }
    return newConfig;
  }
  return config;
}

export async function runWorkflowEngine(
  graphqlUrl: string, 
  adminSecret: string, 
  workflowId: string, 
  orgId: string, 
  userId: string | null,
  triggerContext: any = null,
  existingRunId: string | null = null
) {
  let runId = existingRunId;
  const executionContext: any = {
    trigger: triggerContext || {},
    steps: {}
  };

  if (!runId) {
    // 1. Initialize New Run
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
      workflowId, orgId, userId
    });
    runId = initData.insert_workflow_runs_one.id;
  } else {
    // Resume Run: Update status to running
    const resumeQuery = `
      mutation ResumeRun($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {status: "running"}) {
          id
        }
      }
    `;
    await executeGraphQL(graphqlUrl, adminSecret, resumeQuery, { id: runId });
    
    // Fetch completed step outputs to populate context
    const pastStepsQuery = `
      query GetPastSteps($runId: uuid!) {
        step_runs(where: {workflow_run_id: {_eq: $runId}, status: {_in: ["completed", "failed"]}}) {
          status
          output
          workflow_step {
            name
          }
        }
      }
    `;
    const pastStepsData = await executeGraphQL(graphqlUrl, adminSecret, pastStepsQuery, { runId });
    for (const stepRun of pastStepsData.step_runs) {
      if (stepRun.status === 'completed' && stepRun.workflow_step) {
        executionContext.steps[stepRun.workflow_step.name] = { output: stepRun.output };
      }
    }
  }

  // 2. Fetch all steps for workflow
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
  let isPaused = false;
  let isCancelled = false;

  // Fetch current step runs to see if we already completed them (resuming)
  const currentStepRunsQuery = `
    query GetCurrentStepRuns($runId: uuid!) {
      step_runs(where: {workflow_run_id: {_eq: $runId}}) {
        id
        workflow_step_id
        status
      }
    }
  `;
  const currentStepRunsData = await executeGraphQL(graphqlUrl, adminSecret, currentStepRunsQuery, { runId });
  const completedStepIds = new Set(
    currentStepRunsData.step_runs
      .filter((sr: any) => sr.status === 'completed' || sr.status === 'failed' || sr.status === 'cancelled')
      .map((sr: any) => sr.workflow_step_id)
  );
  
  const pausedStepRuns = currentStepRunsData.step_runs.filter((sr: any) => sr.status === 'paused');

  const workflowStartTime = Date.now();
  const OVERALL_TIMEOUT_MS = 60000;

  // 3. Execute steps sequentially
  for (const step of steps) {
    if (completedStepIds.has(step.id)) {
      continue; // Skip already completed steps on resume
    }

    if (Date.now() - workflowStartTime > OVERALL_TIMEOUT_MS) {
      hasFailure = true;
      break;
    }

    if (isCancelled) {
      // Mark downstream steps as cancelled if a branch halted execution
      const cancelStepQuery = `
        mutation CancelStep($runId: uuid!, $stepId: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $runId,
            workflow_step_id: $stepId,
            status: "cancelled",
            started_at: "now()",
            completed_at: "now()"
          }) {
            id
          }
        }
      `;
      await executeGraphQL(graphqlUrl, adminSecret, cancelStepQuery, { runId, stepId: step.id });
      continue;
    }

    // Find if we have a paused step run for this step
    const existingPausedRun = pausedStepRuns.find((sr: any) => sr.workflow_step_id === step.id);
    let stepRunId = existingPausedRun?.id;

    if (!stepRunId) {
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
      const stepRunData = await executeGraphQL(graphqlUrl, adminSecret, createStepRunQuery, { runId, stepId: step.id });
      stepRunId = stepRunData.insert_step_runs_one.id;
    } else {
      // Update it to running
      const updateStepRunQuery = `
        mutation UpdateStepRun($id: uuid!) {
          update_step_runs_by_pk(pk_columns: {id: $id}, _set: {status: "running"}) {
            id
          }
        }
      `;
      await executeGraphQL(graphqlUrl, adminSecret, updateStepRunQuery, { id: stepRunId });
    }

    let stepStatus = 'completed';
    let stepOutput: any = null;
    let stepError: any = null;
    const stepStartTime = Date.now();

    const maxRetries = step.config?.max_retries ? Math.min(3, Math.max(0, Number(step.config.max_retries))) : 1;
    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
      attempt++;
      try {
        if (step.type === 'http_request') {
          const config = interpolateConfig(step.config, executionContext);
          const url = new URL(config.url);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('SSRF Protection: Only http and https protocols are allowed');
          if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('169.254') || url.hostname === '0.0.0.0') throw new Error('SSRF Protection: Invalid hostname');
          if (/(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(url.hostname)) throw new Error('SSRF Protection: Private IP ranges are restricted');

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          
          const method = config.method || 'GET';
          const fetchOptions: any = { method, signal: controller.signal };
          if (config.body && (method === 'POST' || method === 'PUT')) {
            fetchOptions.body = JSON.stringify(config.body);
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
            const err: any = new Error(`HTTP Error: ${res.status}`);
            err.status = res.status;
            throw err;
          }
        } else if (step.type === 'notify') {
          const config = interpolateConfig(step.config, executionContext);
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
            message: config.message || `Notification from step: ${step.name}`
          });
          stepOutput = { success: true };
        } else if (step.type === 'conditional_branch') {
          const condition = step.config.condition;
          if (!condition || !condition.field || !condition.operator) throw new Error('Malformed conditional branch configuration');
          
          const val1 = resolveContextPath(executionContext, condition.field);
          const val2 = condition.value;
          let matched = false;

          switch (condition.operator) {
            case 'equals': matched = (val1 == val2); break;
            case 'not_equals': matched = (val1 != val2); break;
            case 'contains': matched = (String(val1 || '').includes(String(val2 || ''))); break;
            case 'greater_than': matched = (Number(val1) > Number(val2)); break;
            case 'less_than': matched = (Number(val1) < Number(val2)); break;
            case 'exists': matched = (val1 !== undefined && val1 !== null); break;
            default: throw new Error(`Unsupported operator: ${condition.operator}`);
          }

          stepOutput = { matched };
          if (!matched) {
            isCancelled = true;
          }
        } else if (step.type === 'approval_gate') {
          stepStatus = 'paused';
          isPaused = true;
        } else if (step.type === 'llm_call') {
          const config = interpolateConfig(step.config, executionContext);
          if (config.provider === 'groq') {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set');

            const prompt = String(config.prompt || '').substring(0, 10000);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const openaiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              signal: controller.signal,
              body: JSON.stringify({
                model: config.model || 'llama3-8b-8192',
                messages: [{ role: 'user', content: prompt }],
                temperature: Number(config.temperature) || 0.2,
                max_tokens: 2000
              })
            });
            clearTimeout(timeout);
            const data: any = await openaiRes.json();
            if (!openaiRes.ok) {
               const err: any = new Error(`Groq API error: ${data.error?.message || 'Unknown'}`);
               err.status = openaiRes.status;
               throw err;
            }
            
            stepOutput = {
              response: data.choices?.[0]?.message?.content || '',
              usage: data.usage
            };
          } else {
            throw new Error(`Unsupported LLM provider: ${config.provider}`);
          }
        } else if (step.type === 'db_write') {
          const config = interpolateConfig(step.config, executionContext);
          if (config.table !== 'custom_app_data') {
            throw new Error(`Unauthorized table: ${config.table}. Only custom_app_data is allowed.`);
          }
          if (config.operation !== 'insert' && config.operation !== 'update') {
            throw new Error(`Unauthorized operation: ${config.operation}. Only insert and update are allowed.`);
          }

          const payload = config.data || {};
          if (typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('Data must be a JSON object');
          }

          if (config.operation === 'insert') {
            const insertQuery = `
              mutation DBWriteInsert($orgId: uuid!, $data: jsonb!) {
                insert_custom_app_data_one(object: {org_id: $orgId, data: $data}) { id }
              }
            `;
            const res = await executeGraphQL(graphqlUrl, adminSecret, insertQuery, { orgId, data: payload });
            stepOutput = { id: res.insert_custom_app_data_one.id };
          } else {
            if (!payload.id) throw new Error('Update requires an id field in data');
            const updateQuery = `
              mutation DBWriteUpdate($orgId: uuid!, $id: uuid!, $data: jsonb!) {
                update_custom_app_data(where: {org_id: {_eq: $orgId}, id: {_eq: $id}}, _set: {data: $data}) {
                  affected_rows
                }
              }
            `;
            const { id: recordId, ...updateData } = payload;
            const res = await executeGraphQL(graphqlUrl, adminSecret, updateQuery, { orgId, id: recordId, data: updateData });
            if (res.update_custom_app_data.affected_rows === 0) {
              throw new Error(`Update failed: record not found or does not belong to organization`);
            }
            stepOutput = { affected_rows: res.update_custom_app_data.affected_rows };
          }
        } else {
          throw new Error(`Unsupported step type: ${step.type}`);
        }
        
        success = true;
      } catch (err: any) {
        stepStatus = 'failed';
        stepError = { message: err.message || 'Unknown error' };
        
        // Retry Logic
        const isTransient = err.name === 'AbortError' || err.message.includes('fetch failed') || (err.status && err.status >= 500 && err.status !== 501);
        const shouldRetry = isTransient && attempt < maxRetries && step.type !== 'db_write' && step.type !== 'approval_gate' && step.type !== 'conditional_branch';
        
        if (shouldRetry) {
          stepStatus = 'running';
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
        } else {
          hasFailure = true;
          break; // Stop retrying
        }
      }
    }
    
    if (stepOutput && typeof stepOutput === 'object') {
      stepOutput.duration_ms = Date.now() - stepStartTime;
      stepOutput.retries = attempt - 1;
    } else if (stepStatus !== 'failed' && stepStatus !== 'paused') {
      stepOutput = { duration_ms: Date.now() - stepStartTime, retries: attempt - 1 };
    }

    if (stepError && typeof stepError === 'object') {
       stepError.duration_ms = Date.now() - stepStartTime;
       stepError.retries = attempt - 1;
    }

    const finalizeStepQuery = `
      mutation FinalizeStepRun($id: uuid!, $status: String!, $output: jsonb, $error: jsonb) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {
          status: $status,
          output: $output,
          error: $error,
          completed_at: ${stepStatus === 'paused' ? 'null' : '"now()"'}
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

    if (stepStatus === 'completed') {
      executionContext.steps[step.name] = { output: stepOutput };
    }

    if (hasFailure || isPaused) {
      break;
    }
  }

  let finalStatus = 'completed';
  if (hasFailure) finalStatus = 'failed';
  if (isPaused) finalStatus = 'paused';

  const finalizeRunQuery = `
    mutation FinalizeRun($id: uuid!, $status: String!) {
      update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {
        status: $status,
        completed_at: ${isPaused || finalStatus === 'running' ? 'null' : '"now()"'}
      }) {
        id
      }
    }
  `;
  await executeGraphQL(graphqlUrl, adminSecret, finalizeRunQuery, { id: runId, status: finalStatus });

  return { runId, status: finalStatus };
}

export async function executeGraphQL(url: string, adminSecret: string, query: string, variables: any = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret },
    body: JSON.stringify({ query, variables })
  });

  const json: any = await response.json();
  if (json.errors) throw new Error('GraphQL Error: ' + JSON.stringify(json.errors));
  return json.data;
}
