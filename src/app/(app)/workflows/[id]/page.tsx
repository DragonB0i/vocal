/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState } from 'react';
import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, AlertCircle, CheckCircle2, XCircle, ArrowLeft, Play, Trash2, ToggleRight, ToggleLeft, Key, Clock, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const GET_WORKFLOW = `
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      status
      created_at
      workflow_steps(order_by: {position: asc}) {
        id
        name
        type
        position
        config
      }
      workflow_triggers {
        id
        type
        enabled
      }
      workflow_runs(order_by: {created_at: desc}, limit: 5) {
        id
        status
        started_at
        completed_at
        step_runs(order_by: {created_at: asc}) {
          id
          status
          output
          error
          workflow_step {
            id
            name
            type
          }
        }
      }
    }
  }
`;

const ADD_STEP = `
  mutation AddStep($workflowId: uuid!, $name: String!, $type: String!, $config: jsonb!, $position: Int!) {
    insert_workflow_steps_one(object: {
      workflow_id: $workflowId,
      name: $name,
      type: $type,
      config: $config,
      position: $position
    }) {
      id
    }
  }
`;

const UPDATE_WORKFLOW_STATUS = `
  mutation UpdateWorkflowStatus($id: uuid!, $status: String!) {
    update_workflows_by_pk(pk_columns: {id: $id}, _set: {status: $status}) {
      id
      status
    }
  }
`;

const DELETE_TRIGGER = `
  mutation DeleteTrigger($id: uuid!) {
    delete_workflow_triggers_by_pk(id: $id) {
      id
    }
  }
`;

const TOGGLE_TRIGGER = `
  mutation ToggleTrigger($id: uuid!, $enabled: Boolean!) {
    update_workflow_triggers_by_pk(pk_columns: {id: $id}, _set: {enabled: $enabled}) {
      id
    }
  }
`;

export default function WorkflowDetailPage() {
  const { id } = useParams();
  const { activeRole, isLoading: isOrgLoading } = useOrganization();
  const { data, error, isLoading, mutate } = useSWR(
    id ? [GET_WORKFLOW, { id }] : null,
    ([query, variables]) => fetcher(query, variables)
  );

  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState('http_request');
  const [newStepConfig, setNewStepConfig] = useState<any>({});
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const isViewer = activeRole === 'viewer';
  const isEditor = activeRole === 'editor';

  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setAddError(null);
    try {
      const position = workflow.workflow_steps.length;
      const finalConfig = { ...newStepConfig };
      
      if (newStepType === 'http_request') {
         if (!finalConfig.url) throw new Error("URL is required");
      } else if (newStepType === 'conditional_branch') {
         if (!finalConfig.condition?.field || !finalConfig.condition?.operator) throw new Error("Condition field and operator are required");
      } else if (newStepType === 'llm_call') {
         if (!finalConfig.provider || !finalConfig.prompt) throw new Error("Provider and Prompt are required");
      } else if (newStepType === 'db_write') {
         if (finalConfig.table !== 'custom_app_data') throw new Error("Only custom_app_data is allowed");
         if (!finalConfig.operation) throw new Error("Operation is required");
      }

      await fetcher(ADD_STEP, {
        workflowId: id,
        name: newStepName,
        type: newStepType,
        config: finalConfig,
        position
      });
      mutate();
      setIsAddStepOpen(false);
      setNewStepName('');
      setNewStepConfig({});
    } catch (err: any) {
      setAddError(err.message || 'Failed to add step. Permission denied.');
    } finally {
      setIsAdding(false);
    }
  };

  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [approvingStepId, setApprovingStepId] = useState<string | null>(null);

  const handleCreateWebhook = async () => {
    setIsCreatingWebhook(true);
    setWebhookSecret(null);
    try {
      const nhost = (window as any).__NHOST_CLIENT__;
      const { res, error } = await nhost.functions.call('create-webhook', { workflowId: id });
      if (error) throw new Error(error.message);
      
      setWebhookSecret(res.data.secret);
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to create webhook');
    } finally {
      setIsCreatingWebhook(false);
    }
  };

  const handleRunWorkflow = async () => {
    setIsRunning(true);
    setRunError(null);
    try {
      const nhost = (window as any).__NHOST_CLIENT__;
      if (!nhost) throw new Error('Nhost client not found');
      
      const { res, error } = await nhost.functions.call('execute-workflow', { workflowId: id });
      
      if (error) {
        throw new Error(error.message || 'Execution failed');
      }
      
      mutate();
    } catch (err: any) {
      setRunError(err.message || 'Failed to execute workflow.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleApproveStep = async (runId: string, stepId: string) => {
    setApprovingStepId(stepId);
    try {
      const nhost = (window as any).__NHOST_CLIENT__;
      const { res, error } = await nhost.functions.call('approve-step', { runId, stepId });
      if (error) throw new Error(error.message);
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to approve step');
    } finally {
      setApprovingStepId(null);
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!confirm('Are you sure you want to delete this trigger?')) return;
    try {
      await fetcher(DELETE_TRIGGER, { id: triggerId });
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to delete trigger');
    }
  };

  const handleToggleTrigger = async (triggerId: string, currentEnabled: boolean) => {
    try {
      await fetcher(TOGGLE_TRIGGER, { id: triggerId, enabled: !currentEnabled });
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle trigger');
    }
  };

  const handleToggleWorkflowStatus = async (currentStatus: string) => {
    if (isViewer) return;
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      await fetcher(UPDATE_WORKFLOW_STATUS, { id, status: newStatus });
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to update workflow status');
    }
  };

  if (isOrgLoading || (isLoading && !error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data?.workflows_by_pk) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Workflow not found or access denied</h3>
            <div className="mt-4">
              <Link href="/workflows" className="text-sm font-medium text-red-800 underline">
                &larr; Back to Workflows
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const workflow = data.workflows_by_pk;

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Link href="/workflows" className="text-sm text-indigo-600 hover:text-indigo-900 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      {runError && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Execution Error</h3>
              <p className="mt-1 text-sm text-red-700">{runError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white px-4 py-5 shadow sm:rounded-lg sm:px-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              {workflow.name}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
              {workflow.description || 'No description'}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                workflow.status === 'active' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                workflow.status === 'disabled' ? 'bg-red-50 text-red-700 ring-red-600/10' : 
                'bg-gray-50 text-gray-600 ring-gray-500/10'
              }`}>
                {workflow.status}
              </span>
              <span className="text-xs text-gray-400">ID: {workflow.id}</span>
            </div>
          </div>
          {!isViewer && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleToggleWorkflowStatus(workflow.status)}
                className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                {workflow.status === 'active' ? <ToggleRight className="h-5 w-5 text-indigo-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                {workflow.status === 'active' ? 'Active' : 'Disabled'}
              </button>
              
              <button
                onClick={handleRunWorkflow}
                disabled={isRunning || workflow.status !== 'active'}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                title={workflow.status !== 'active' ? 'Workflow must be active to run' : ''}
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isRunning ? 'Running...' : 'Run Workflow'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Steps */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="border-b border-gray-200 px-4 py-5 sm:flex sm:items-center sm:justify-between sm:px-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">Steps</h3>
            <div className="mt-3 sm:ml-4 sm:mt-0">
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => setIsAddStepOpen(true)}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  Add Step
                </button>
              )}
            </div>
          </div>
          <div className="px-4 py-5 sm:p-6">
            {isAddStepOpen && (
              <form onSubmit={handleAddStep} className="mb-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-4">New Step</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Step Name</label>
                    <input type="text" required value={newStepName} onChange={e => setNewStepName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <select value={newStepType} onChange={e => setNewStepType(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border bg-white">
                      <option value="http_request">HTTP Request</option>
                      <option value="conditional_branch">Conditional Branch</option>
                      <option value="approval_gate">Approval Gate</option>
                      <option value="llm_call">LLM Call</option>
                      <option value="db_write" disabled={isEditor}>Database Write (Owner Only)</option>
                      <option value="notify" disabled={isEditor}>Notification (Owner Only)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 border-t border-gray-200 pt-4">
                  {newStepType === 'http_request' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">URL</label>
                        <input type="text" required value={newStepConfig.url || ''} onChange={e => setNewStepConfig({...newStepConfig, url: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Method</label>
                        <select value={newStepConfig.method || 'GET'} onChange={e => setNewStepConfig({...newStepConfig, method: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white">
                          <option>GET</option><option>POST</option><option>PUT</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {newStepType === 'conditional_branch' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Field Path (e.g. steps.Step1.output.status)</label>
                        <input type="text" required value={newStepConfig.condition?.field || ''} onChange={e => setNewStepConfig({...newStepConfig, condition: {...newStepConfig.condition, field: e.target.value}})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Operator</label>
                          <select required value={newStepConfig.condition?.operator || 'equals'} onChange={e => setNewStepConfig({...newStepConfig, condition: {...newStepConfig.condition, operator: e.target.value}})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white">
                            <option value="equals">Equals</option>
                            <option value="not_equals">Not Equals</option>
                            <option value="contains">Contains</option>
                            <option value="greater_than">Greater Than</option>
                            <option value="less_than">Less Than</option>
                            <option value="exists">Exists</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Value</label>
                          <input type="text" value={newStepConfig.condition?.value || ''} onChange={e => setNewStepConfig({...newStepConfig, condition: {...newStepConfig.condition, value: e.target.value}})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" />
                        </div>
                      </div>
                    </div>
                  )}

                  {newStepType === 'llm_call' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Provider</label>
                        <select required value={newStepConfig.provider || 'openai'} onChange={e => setNewStepConfig({...newStepConfig, provider: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white">
                          <option value="openai">OpenAI</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Model</label>
                        <input type="text" value={newStepConfig.model || 'gpt-3.5-turbo'} onChange={e => setNewStepConfig({...newStepConfig, model: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Prompt (Supports {'{{ interpolation }}'})</label>
                        <textarea required value={newStepConfig.prompt || ''} onChange={e => setNewStepConfig({...newStepConfig, prompt: e.target.value})} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" />
                      </div>
                    </div>
                  )}

                  {newStepType === 'db_write' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Table (Allowed only)</label>
                          <select required value={newStepConfig.table || 'custom_app_data'} onChange={e => setNewStepConfig({...newStepConfig, table: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white">
                            <option value="custom_app_data">custom_app_data</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Operation</label>
                          <select required value={newStepConfig.operation || 'insert'} onChange={e => setNewStepConfig({...newStepConfig, operation: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white">
                            <option value="insert">Insert</option>
                            <option value="update">Update</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Data (JSON object)</label>
                        <textarea required placeholder='{"key": "value"}' onChange={e => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            setNewStepConfig({...newStepConfig, data: parsed});
                          } catch(err) { /* ignore until submit */ }
                        }} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border font-mono text-xs" />
                      </div>
                    </div>
                  )}

                  {newStepType === 'notify' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Message</label>
                        <input type="text" required value={newStepConfig.message || ''} onChange={e => setNewStepConfig({...newStepConfig, message: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border" />
                      </div>
                    </div>
                  )}
                  
                  {newStepType === 'approval_gate' && (
                    <p className="text-sm text-gray-500">Execution will pause until an authorized user approves it.</p>
                  )}
                </div>

                {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
                <div className="mt-4 flex gap-2">
                  <button type="submit" disabled={isAdding} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-500">Save</button>
                  <button type="button" disabled={isAdding} onClick={() => setIsAddStepOpen(false)} className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            )}

            <ul role="list" className="divide-y divide-gray-200">
              {workflow.workflow_steps.length === 0 ? (
                <li className="py-4 text-sm text-gray-500">No steps defined.</li>
              ) : (
                workflow.workflow_steps.map((step: any, index: number) => (
                  <li key={step.id} className="flex items-start justify-between py-4">
                    <div className="flex items-start">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-500 mt-1">
                        {index + 1}
                      </span>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-900">{step.name}</p>
                        <p className="text-sm text-gray-500 font-mono text-xs mt-0.5">{step.type}</p>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Triggers & Recent Runs */}
        <div className="space-y-6">
          <div className="bg-white shadow sm:rounded-lg">
            <div className="border-b border-gray-200 px-4 py-5 sm:px-6 flex justify-between items-center">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Triggers</h3>
              {activeRole === 'owner' && (
                <button
                  type="button"
                  onClick={handleCreateWebhook}
                  disabled={isCreatingWebhook}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isCreatingWebhook ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Key className="h-4 w-4 mr-1" />}
                  Add Webhook
                </button>
              )}
            </div>
            <div className="px-4 py-5 sm:p-6">
              {webhookSecret && (
                <div className="mb-4 rounded-md bg-yellow-50 p-4 border border-yellow-200">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">Webhook Secret Generated</h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>Copy this secret now. It cannot be retrieved later.</p>
                        <p className="mt-2 font-mono bg-yellow-100 p-2 rounded break-all">{webhookSecret}</p>
                      </div>
                      <div className="mt-4">
                        <button type="button" onClick={() => setWebhookSecret(null)} className="text-sm font-medium text-yellow-800 hover:text-yellow-900 underline">Dismiss</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {workflow.workflow_triggers.length === 0 ? (
                <p className="text-sm text-gray-500">No triggers defined. Workflow must be triggered manually.</p>
              ) : (
                <ul className="space-y-3">
                  {workflow.workflow_triggers.map((t: any) => (
                    <li key={t.id} className="flex items-center justify-between text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium capitalize">{t.type}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {t.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 font-mono">ID: {t.id}</p>
                      </div>
                      
                      {!isViewer && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleTrigger(t.id, t.enabled)}
                            className="p-1 text-gray-500 hover:text-indigo-600 transition-colors"
                            title={t.enabled ? "Disable" : "Enable"}
                          >
                            {t.enabled ? <ToggleRight className="h-5 w-5 text-indigo-600" /> : <ToggleLeft className="h-5 w-5" />}
                          </button>
                          
                          {(activeRole === 'owner' || t.type !== 'webhook') && (
                            <button
                              onClick={() => handleDeleteTrigger(t.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white shadow sm:rounded-lg overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-5 sm:px-6 flex justify-between items-center">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Recent Runs</h3>
              <Link href={`/runs?workflow=${workflow.id}`} className="text-sm text-indigo-600 hover:text-indigo-900 font-medium">View all</Link>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <ul className="divide-y divide-gray-100 space-y-4">
                {workflow.workflow_runs.length === 0 ? (
                  <p className="text-sm text-gray-500">No runs recorded.</p>
                ) : (
                  workflow.workflow_runs.map((run: any) => (
                    <li key={run.id} className="pt-4 first:pt-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {run.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                           run.status === 'failed' ? <XCircle className="h-5 w-5 text-red-500" /> : 
                           run.status === 'paused' ? <Clock className="h-5 w-5 text-yellow-500" /> : 
                           <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                          <span className="ml-3 text-sm font-medium text-gray-900 capitalize">{run.status}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-gray-500">
                            {new Date(run.started_at).toLocaleString()}
                            {run.completed_at && (
                              <span className="ml-2 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s
                              </span>
                            )}
                          </span>
                          <Link href={`/runs/${run.id}`} className="text-xs text-indigo-600 hover:text-indigo-900 border border-gray-200 rounded px-2 py-1 bg-white shadow-sm">Details</Link>
                        </div>
                      </div>
                      
                      <div className="mt-3 pl-8">
                        <ul className="space-y-2">
                          {run.step_runs?.map((sr: any) => (
                            <li key={sr.id} className="text-sm flex flex-col gap-1 border-l-2 border-gray-200 pl-3 py-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-700">{sr.workflow_step.name}</span>
                                <div className="flex items-center gap-2">
                                  {(sr.output?.retries > 0 || sr.error?.retries > 0) && (
                                    <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">
                                      {sr.output?.retries || sr.error?.retries} retries
                                    </span>
                                  )}
                                  {(sr.output?.duration_ms || sr.error?.duration_ms) && (
                                    <span className="text-xs text-gray-500">
                                      {Math.round((sr.output?.duration_ms || sr.error?.duration_ms) / 1000 * 10) / 10}s
                                    </span>
                                  )}
                                  <span className={`text-xs capitalize ${sr.status === 'completed' ? 'text-green-600' : sr.status === 'failed' ? 'text-red-600' : sr.status === 'paused' ? 'text-yellow-600' : sr.status === 'cancelled' ? 'text-gray-400' : 'text-blue-600'}`}>{sr.status}</span>
                                </div>
                              </div>
                              
                              {sr.status === 'paused' && sr.workflow_step.type === 'approval_gate' && !isViewer && (
                                <div className="mt-2">
                                  <button
                                    onClick={() => handleApproveStep(run.id, sr.id)}
                                    disabled={approvingStepId === sr.id}
                                    className="inline-flex items-center rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-100 disabled:opacity-50"
                                  >
                                    {approvingStepId === sr.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                                    Approve & Resume
                                  </button>
                                </div>
                              )}

                              {sr.error && (
                                <div className="mt-1 bg-red-50 text-red-700 text-xs p-2 rounded border border-red-100">
                                  <span className="font-semibold block mb-1">Execution Error:</span>
                                  {sr.error.message || JSON.stringify(sr.error)}
                                </div>
                              )}
                              {sr.output && sr.status !== 'paused' && (
                                <div className="mt-1 bg-gray-50 text-gray-600 text-xs p-2 rounded font-mono overflow-hidden whitespace-pre-wrap max-h-32 overflow-y-auto border border-gray-100">
                                  {JSON.stringify({...sr.output, duration_ms: undefined, retries: undefined}, null, 2)}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
