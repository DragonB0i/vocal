/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState } from 'react';
import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, AlertCircle, CheckCircle2, XCircle, ArrowLeft, Play, Trash2, ToggleRight, ToggleLeft, Key, Clock, Check, ArrowUp, ArrowDown, Edit2, Save, X, Eye, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

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

const UPDATE_STEP = `
  mutation UpdateStep($id: uuid!, $name: String!, $config: jsonb!) {
    update_workflow_steps_by_pk(pk_columns: {id: $id}, _set: {name: $name, config: $config}) {
      id
    }
  }
`;

const DELETE_STEP = `
  mutation DeleteStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`;

const UPDATE_STEP_POSITION = `
  mutation UpdateStepPosition($id: uuid!, $position: Int!) {
    update_workflow_steps_by_pk(pk_columns: {id: $id}, _set: {position: $position}) {
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

// Validation Helper
const validateWorkflowConfig = (type: string, config: any): string | null => {
  if (type === 'http_request') {
    if (!config.url) return "URL is required";
    if (!config.url.startsWith('http://') && !config.url.startsWith('https://')) return "URL must start with http:// or https://";
  } else if (type === 'conditional_branch') {
    if (!config.condition?.field) return "Condition field is required";
    if (!config.condition?.operator) return "Condition operator is required";
  } else if (type === 'llm_call') {
    if (!config.provider) return "Provider is required";
    if (!config.prompt || config.prompt.trim() === '') return "Prompt is required";
  } else if (type === 'db_write') {
    if (config.table !== 'custom_app_data') return "Only custom_app_data is allowed";
    if (!config.operation) return "Operation is required";
    if (!config.data || typeof config.data !== 'object') return "Data payload must be a valid JSON object";
  } else if (type === 'notify') {
    if (!config.message || config.message.trim() === '') return "Message is required";
  }
  return null;
};

export default function WorkflowDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { activeRole, isLoading: isOrgLoading } = useOrganization();
  const { data, error, isLoading, mutate } = useSWR(
    id ? [GET_WORKFLOW, { id }] : null,
    ([query, variables]) => fetcher(query, variables)
  );

  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Step Addition State
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState('http_request');
  const [newStepConfig, setNewStepConfig] = useState<any>({});
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Step Editing State
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editStepName, setEditStepName] = useState('');
  const [editStepConfig, setEditStepConfig] = useState<any>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Preview State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Trigger State
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  
  const [approvingStepId, setApprovingStepId] = useState<string | null>(null);

  const isViewer = activeRole === 'viewer';
  const isEditor = activeRole === 'editor';
  const isOwner = activeRole === 'owner';

  const workflow = data?.workflows_by_pk;

  // Helpers to handle config changes
  const handleConfigChange = (setter: any, state: any, field: string, value: any) => {
    setter({ ...state, [field]: value });
  };
  const handleConditionChange = (setter: any, state: any, field: string, value: any) => {
    setter({ ...state, condition: { ...state.condition, [field]: value } });
  };
  const handleJSONChange = (setter: any, state: any, field: string, value: string) => {
    try {
      const parsed = JSON.parse(value);
      setter({ ...state, [field]: parsed });
    } catch (e) {
      // Don't update state if invalid JSON, wait for valid parse
    }
  };

  // Step Actions
  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setAddError(null);
    try {
      const finalConfig = { ...newStepConfig };
      const validationError = validateWorkflowConfig(newStepType, finalConfig);
      if (validationError) throw new Error(validationError);

      await fetcher(ADD_STEP, {
        workflowId: id,
        name: newStepName,
        type: newStepType,
        config: finalConfig,
        position: workflow.workflow_steps.length
      });
      mutate();
      setIsAddStepOpen(false);
      setNewStepName('');
      setNewStepConfig({});
    } catch (err: any) {
      setAddError(err.message || 'Failed to add step.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleStartEdit = (step: any) => {
    setEditingStepId(step.id);
    setEditStepName(step.name);
    setEditStepConfig(step.config || {});
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    setIsEditing(true);
    setEditError(null);
    try {
      const step = workflow.workflow_steps.find((s: any) => s.id === editingStepId);
      const validationError = validateWorkflowConfig(step.type, editStepConfig);
      if (validationError) throw new Error(validationError);

      await fetcher(UPDATE_STEP, {
        id: editingStepId,
        name: editStepName,
        config: editStepConfig
      });
      mutate();
      setEditingStepId(null);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update step.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return;
    try {
      await fetcher(DELETE_STEP, { id: stepId });
      // We could also re-index remaining steps here to keep position sequential, 
      // but ordering is driven by asc sorting on position anyway.
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to delete step');
    }
  };

  const handleMoveStep = async (index: number, direction: 'up' | 'down') => {
    if (isViewer) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === workflow.workflow_steps.length - 1) return;

    const currentStep = workflow.workflow_steps[index];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const targetStep = workflow.workflow_steps[targetIndex];

    try {
      // Swap positions
      const currentPos = currentStep.position;
      const targetPos = targetStep.position;

      // In GraphQL we do this sequentially. 
      // Technically better in a single transaction but SWR mutate will hide the delay.
      await fetcher(UPDATE_STEP_POSITION, { id: currentStep.id, position: targetPos });
      await fetcher(UPDATE_STEP_POSITION, { id: targetStep.id, position: currentPos });
      
      mutate();
    } catch (err: any) {
      alert(err.message || 'Failed to move step');
    }
  };

  // Execution & Triggers
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
      
      // Navigate to run details
      if (res?.data?.runId) {
        router.push(`/runs/${res.data.runId}`);
      } else {
        mutate(); // Fallback if no runId returned
      }
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

  // Render Helpers
  const renderStepConfigForm = (type: string, config: any, setConfig: any) => {
    return (
      <div className="space-y-4">
        {type === 'http_request' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">URL</label>
              <input type="text" required value={config.url || ''} onChange={e => handleConfigChange(setConfig, config, 'url', e.target.value)} placeholder="https://api.example.com/v1/data" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Method</label>
              <select value={config.method || 'GET'} onChange={e => handleConfigChange(setConfig, config, 'method', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500">
                <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
              </select>
            </div>
          </div>
        )}

        {type === 'conditional_branch' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">Field Path (e.g. steps.Step1.output.status)</label>
              <input type="text" required value={config.condition?.field || ''} onChange={e => handleConditionChange(setConfig, config, 'field', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">Operator</label>
                <select required value={config.condition?.operator || 'equals'} onChange={e => handleConditionChange(setConfig, config, 'operator', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not Equals</option>
                  <option value="contains">Contains</option>
                  <option value="greater_than">Greater Than</option>
                  <option value="less_than">Less Than</option>
                  <option value="exists">Exists</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Value</label>
                <input type="text" value={config.condition?.value || ''} onChange={e => handleConditionChange(setConfig, config, 'value', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
          </div>
        )}

        {type === 'llm_call' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">Provider</label>
              <select required value={config.provider || 'groq'} onChange={e => handleConfigChange(setConfig, config, 'provider', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500">
                <option value="groq">Groq</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Model</label>
              <input type="text" value={config.model || 'llama3-8b-8192'} onChange={e => handleConfigChange(setConfig, config, 'model', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Prompt (Supports {'{{ interpolation }}'})</label>
              <textarea required value={config.prompt || ''} onChange={e => handleConfigChange(setConfig, config, 'prompt', e.target.value)} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
        )}

        {type === 'db_write' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">Table (Allowed only)</label>
                <select required value={config.table || 'custom_app_data'} onChange={e => handleConfigChange(setConfig, config, 'table', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="custom_app_data">custom_app_data</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Operation</label>
                <select required value={config.operation || 'insert'} onChange={e => handleConfigChange(setConfig, config, 'operation', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border bg-white focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="insert">Insert</option>
                  <option value="update">Update</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Data (JSON object)</label>
              <textarea required defaultValue={config.data ? JSON.stringify(config.data, null, 2) : ''} onChange={e => handleJSONChange(setConfig, config, 'data', e.target.value)} placeholder='{"key": "value"}' rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border font-mono text-xs focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
        )}

        {type === 'notify' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">Message</label>
              <input type="text" required value={config.message || ''} onChange={e => handleConfigChange(setConfig, config, 'message', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm px-3 py-2 border focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
        )}
        
        {type === 'approval_gate' && (
          <div className="bg-indigo-50 text-indigo-700 p-3 rounded text-sm">
            Execution will pause securely until an authorized user manually approves it from the run details view.
          </div>
        )}
      </div>
    );
  };

  const renderStepSummary = (type: string, config: any) => {
    switch (type) {
      case 'http_request': return <span className="text-gray-600 truncate"><strong className="text-gray-900">{config.method || 'GET'}</strong> {config.url || 'No URL'}</span>;
      case 'conditional_branch': return <span className="text-gray-600 truncate">If <strong className="text-gray-900">{config.condition?.field}</strong> {config.condition?.operator} {config.condition?.value}</span>;
      case 'llm_call': return <span className="text-gray-600 truncate">Prompt via <strong className="text-gray-900">{config.provider || 'groq'}</strong></span>;
      case 'db_write': return <span className="text-gray-600 truncate"><strong className="text-gray-900">{config.operation?.toUpperCase()}</strong> to {config.table}</span>;
      case 'notify': return <span className="text-gray-600 truncate">Send notification</span>;
      case 'approval_gate': return <span className="text-gray-600 truncate">Requires human review</span>;
      default: return <span className="text-gray-600">No configuration</span>;
    }
  };

  // Status & Init Checks
  if (isOrgLoading || (isLoading && !error && !data)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Workflow not found or access denied</h3>
            <div className="mt-4">
              <Link href="/workflows" className="text-sm font-medium text-red-800 underline">&larr; Back to Workflows</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Derived state
  const hasValidationErrors = workflow.workflow_steps.some((s: any) => validateWorkflowConfig(s.type, s.config) !== null);

  return (
    <div className="space-y-6 pb-12">
      <div className="mb-4">
        <Link href="/workflows" className="text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Workflows
        </Link>
      </div>

      {workflow.status === 'active' && !isViewer && (
        <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-blue-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Draft Editing Safety</h3>
              <p className="mt-1 text-sm text-blue-700">This workflow is Active. Editing its steps will immediately affect the graph for future executions.</p>
            </div>
          </div>
        </div>
      )}

      {runError && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
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
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div>
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              {workflow.name}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
              {workflow.description || 'No description'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                workflow.status === 'active' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                workflow.status === 'disabled' ? 'bg-red-50 text-red-700 ring-red-600/10' : 
                'bg-gray-50 text-gray-600 ring-gray-500/10'
              }`}>
                {workflow.status.toUpperCase()}
              </span>
              <span className="text-xs text-gray-400 font-mono">ID: {workflow.id}</span>
            </div>
          </div>
          {!isViewer && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setIsPreviewOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                <Eye className="h-4 w-4" /> Preview Execution
              </button>
              
              <button
                onClick={() => handleToggleWorkflowStatus(workflow.status)}
                className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                {workflow.status === 'active' ? <ToggleRight className="h-5 w-5 text-indigo-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                {workflow.status === 'active' ? 'Disable' : 'Activate'}
              </button>
              
              <button
                onClick={handleRunWorkflow}
                disabled={isRunning || workflow.status !== 'active' || hasValidationErrors}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                title={workflow.status !== 'active' ? 'Workflow must be active to run' : hasValidationErrors ? 'Fix validation errors first' : ''}
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isRunning ? 'Initiating...' : 'Run Workflow'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Steps Column (Takes up 2/3 space on large screens) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow sm:rounded-lg">
            <div className="border-b border-gray-200 px-4 py-5 sm:flex sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="text-base font-semibold leading-6 text-gray-900">Workflow Steps</h3>
                <p className="mt-1 text-sm text-gray-500">Execution flows sequentially from top to bottom.</p>
              </div>
              <div className="mt-3 sm:ml-4 sm:mt-0">
                {!isViewer && (
                  <button
                    type="button"
                    onClick={() => { setIsAddStepOpen(true); setEditingStepId(null); }}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    Add Step
                  </button>
                )}
              </div>
            </div>
            <div className="px-4 py-5 sm:p-6 bg-gray-50 min-h-[300px]">
              
              {isAddStepOpen && (
                <form onSubmit={handleAddStep} className="mb-6 p-4 bg-white shadow-sm rounded-lg border border-indigo-200 ring-1 ring-indigo-500 ring-opacity-50">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                    <h4 className="text-sm font-semibold text-indigo-900">New Step Configuration</h4>
                    <button type="button" onClick={() => setIsAddStepOpen(false)} className="text-gray-400 hover:text-gray-500"><X className="h-4 w-4" /></button>
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Step Name</label>
                      <input type="text" required value={newStepName} onChange={e => setNewStepName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Type</label>
                      <select value={newStepType} onChange={e => {
                        setNewStepType(e.target.value);
                        setNewStepConfig({}); // Reset config on type change
                      }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border bg-white">
                        <option value="http_request">HTTP Request</option>
                        <option value="conditional_branch">Conditional Branch</option>
                        <option value="approval_gate">Approval Gate</option>
                        <option value="llm_call">LLM Call</option>
                        <option value="db_write" disabled={!isOwner}>Database Write (Owner Only)</option>
                        <option value="notify" disabled={!isOwner}>Notification (Owner Only)</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h5 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Configuration</h5>
                    {renderStepConfigForm(newStepType, newStepConfig, setNewStepConfig)}
                  </div>

                  {addError && <p className="mt-4 text-sm text-red-600 font-medium">{addError}</p>}
                  
                  <div className="mt-6 flex gap-3 pt-4 border-t border-gray-100">
                    <button type="submit" disabled={isAdding} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-indigo-500 flex items-center gap-2">
                      {isAdding && <Loader2 className="h-4 w-4 animate-spin" />} Save Step
                    </button>
                    <button type="button" disabled={isAdding} onClick={() => setIsAddStepOpen(false)} className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-gray-50">Cancel</button>
                  </div>
                </form>
              )}

              <ul role="list" className="space-y-4">
                {workflow.workflow_steps.length === 0 && !isAddStepOpen ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">No steps</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new step.</p>
                  </div>
                ) : (
                  workflow.workflow_steps.map((step: any, index: number) => {
                    const validationErr = validateWorkflowConfig(step.type, step.config);
                    
                    if (editingStepId === step.id) {
                      return (
                        <li key={step.id} className="bg-white shadow-sm rounded-lg border-2 border-indigo-500 p-4 relative">
                          <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                            <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                              <Edit2 className="h-4 w-4" /> Editing Step {index + 1}
                            </h4>
                          </div>
                          
                          <div className="mb-4">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Step Name</label>
                            <input type="text" required value={editStepName} onChange={e => setEditStepName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
                          </div>

                          <div className="mb-4">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Type <span className="font-normal text-gray-500 lowercase">(Cannot be changed after creation)</span></label>
                            <input type="text" disabled value={step.type} className="mt-1 block w-full rounded-md border-gray-200 bg-gray-50 text-gray-500 shadow-sm sm:text-sm px-3 py-2 border font-mono" />
                          </div>

                          <div className="mt-6">
                            <h5 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Configuration</h5>
                            {renderStepConfigForm(step.type, editStepConfig, setEditStepConfig)}
                          </div>

                          {editError && <p className="mt-4 text-sm text-red-600 font-medium">{editError}</p>}
                          
                          <div className="mt-6 flex gap-3 pt-4 border-t border-gray-100">
                            <button onClick={handleSaveEdit} disabled={isEditing} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-indigo-500 flex items-center gap-2">
                              {isEditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                            </button>
                            <button onClick={() => setEditingStepId(null)} disabled={isEditing} className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-gray-50">Cancel</button>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li key={step.id} className={`bg-white shadow-sm rounded-lg border ${validationErr ? 'border-red-300' : 'border-gray-200'} p-4 transition-all hover:shadow-md flex items-start gap-4`}>
                        <div className="flex flex-col items-center gap-1 mt-1">
                          {!isViewer && (
                            <button onClick={() => handleMoveStep(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-400 p-1">
                              <ArrowUp className="h-4 w-4" />
                            </button>
                          )}
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                            {index + 1}
                          </span>
                          {!isViewer && (
                            <button onClick={() => handleMoveStep(index, 'down')} disabled={index === workflow.workflow_steps.length - 1} className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-400 p-1">
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-gray-900 truncate">{step.name}</h4>
                            {!isViewer && (
                              <div className="flex items-center gap-2 ml-4">
                                <button onClick={() => handleStartEdit(step)} className="text-gray-400 hover:text-indigo-600 p-1 transition-colors" title="Edit Step">
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button onClick={() => handleDeleteStep(step.id)} className="text-gray-400 hover:text-red-600 p-1 transition-colors" title="Delete Step">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          
                          <div className="mt-1 flex items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 font-mono">
                              {step.type}
                            </span>
                            <span className="text-xs text-gray-500 truncate max-w-full block">
                              {renderStepSummary(step.type, step.config)}
                            </span>
                          </div>

                          {validationErr && (
                            <div className="mt-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                              <span className="font-medium">Configuration Error: {validationErr}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          {/* Triggers */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="border-b border-gray-200 px-4 py-5 sm:px-6 flex justify-between items-center">
              <div>
                <h3 className="text-base font-semibold leading-6 text-gray-900">Triggers</h3>
                <p className="text-xs text-gray-500 mt-1">Configure automated execution.</p>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={handleCreateWebhook}
                  disabled={isCreatingWebhook}
                  className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isCreatingWebhook ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Key className="h-3 w-3 mr-1" />}
                  Add Webhook
                </button>
              )}
            </div>
            <div className="px-4 py-5 sm:p-6 space-y-4">
              
              {/* Default Manual Trigger Display */}
              <div className="flex items-center justify-between text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Manual Execution</span>
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Built-in</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Run directly from UI.</p>
                </div>
              </div>

              {webhookSecret && (
                <div className="rounded-md bg-yellow-50 p-4 border border-yellow-300 shadow-sm">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <div className="ml-3">
                      <h3 className="text-sm font-bold text-yellow-800">Critical: Save Webhook Secret</h3>
                      <div className="mt-2 text-sm text-yellow-700 space-y-2">
                        <p>Copy this secret now. It is hashed in the database and <strong>cannot be retrieved later</strong>.</p>
                        <p className="font-mono bg-white p-2 rounded border border-yellow-200 break-all select-all text-xs font-bold text-gray-900">{webhookSecret}</p>
                        <p className="text-xs italic">Use this as the bearer token for your POST request.</p>
                      </div>
                      <div className="mt-4">
                        <button type="button" onClick={() => setWebhookSecret(null)} className="text-sm font-semibold text-yellow-800 hover:text-yellow-900 underline">I have saved it</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {workflow.workflow_triggers.map((t: any) => (
                <div key={t.id} className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold capitalize">{t.type} Trigger</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${t.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {t.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 font-mono">ID: {t.id}</p>
                    </div>
                    
                    {!isViewer && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleToggleTrigger(t.id, t.enabled)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors" title={t.enabled ? "Disable" : "Enable"}>
                          {t.enabled ? <ToggleRight className="h-4 w-4 text-indigo-600" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
                        
                        {(isOwner || t.type !== 'webhook') && (
                          <button onClick={() => handleDeleteTrigger(t.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {t.type === 'webhook' && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Webhook Endpoint URL</p>
                      <div className="bg-gray-50 p-2 rounded text-[10px] font-mono break-all text-gray-600 border border-gray-200">
                        POST {window.location.origin}/v1/functions/webhook?triggerId={t.id}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Runs */}
          <div className="bg-white shadow sm:rounded-lg overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-5 sm:px-6 flex justify-between items-center bg-gray-50">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Recent Runs</h3>
              <Link href={`/runs?workflow=${workflow.id}`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-900 bg-white px-2 py-1 rounded border border-indigo-100 shadow-sm">View all</Link>
            </div>
            <div className="px-4 py-5 sm:p-0">
              <ul className="divide-y divide-gray-100">
                {workflow.workflow_runs.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">No runs recorded.</div>
                ) : (
                  workflow.workflow_runs.map((run: any) => (
                    <li key={run.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {run.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                           run.status === 'failed' ? <XCircle className="h-5 w-5 text-red-500" /> : 
                           run.status === 'paused' ? <Clock className="h-5 w-5 text-yellow-500" /> : 
                           <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                          <Link href={`/runs/${run.id}`} className="ml-3 text-sm font-semibold text-gray-900 hover:text-indigo-600 capitalize block truncate max-w-[120px]">
                            {run.id.split('-')[0]}
                          </Link>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-gray-500 font-medium">
                            {new Date(run.started_at).toLocaleDateString()} {new Date(run.started_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                          {run.completed_at && (
                            <span className="text-[10px] text-gray-400 mt-0.5">
                              {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s duration
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Execution Preview Modal */}
      {isPreviewOpen && (
        <div className="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsPreviewOpen(false)}></div>
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
                    <Eye className="h-6 w-6 text-indigo-600" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-5">
                    <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">Execution Preview</h3>
                    <div className="mt-2 text-sm text-gray-500">
                      <p>This is a dry-run summary. The workflow will execute the following {workflow.workflow_steps.length} steps sequentially:</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 border-t border-gray-100 pt-4">
                  {hasValidationErrors && (
                    <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>Cannot execute: Workflow contains configuration errors. Please fix them before running.</div>
                    </div>
                  )}

                  <ul className="space-y-3">
                    {workflow.workflow_steps.map((step: any, idx: number) => (
                      <li key={step.id} className="flex gap-3 text-sm text-left">
                        <span className="text-gray-400 font-mono w-4 shrink-0">{idx + 1}.</span>
                        <div>
                          <span className="font-semibold text-gray-900">{step.name}</span>
                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-2">
                            <span className="bg-gray-100 px-1.5 rounded">{step.type}</span>
                            {step.type === 'db_write' && <span className="text-red-600 font-medium">⚠️ Dangerous (DB Mutation)</span>}
                            {step.type === 'http_request' && <span className="text-orange-600 font-medium">⚠️ Outbound Request</span>}
                            {step.type === 'approval_gate' && <span className="text-indigo-600 font-medium">⏳ Pauses Execution</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                    {workflow.workflow_steps.length === 0 && (
                      <div className="text-center text-sm text-gray-500 italic">No steps to execute.</div>
                    )}
                  </ul>
                </div>
                
                <div className="mt-6 sm:flex sm:flex-row-reverse gap-2">
                  <button
                    type="button"
                    disabled={hasValidationErrors || isRunning || workflow.status !== 'active'}
                    onClick={() => {
                      setIsPreviewOpen(false);
                      handleRunWorkflow();
                    }}
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:w-auto disabled:opacity-50"
                  >
                    Confirm & Run
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
