/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState } from 'react';
import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, AlertCircle, CheckCircle2, XCircle, ArrowLeft, Play } from 'lucide-react';
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
      }
      workflow_triggers {
        id
        type
      }
      workflow_runs(order_by: {created_at: desc}, limit: 5) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;

const ADD_STEP = `
  mutation AddStep($workflowId: uuid!, $name: String!, $type: String!, $config: jsonb!) {
    insert_workflow_steps_one(object: {
      workflow_id: $workflowId,
      name: $name,
      type: $type,
      config: $config
    }) {
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
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const isViewer = activeRole === 'viewer';
  const isEditor = activeRole === 'editor';

  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setAddError(null);
    try {
      await fetcher(ADD_STEP, {
        workflowId: id,
        name: newStepName,
        type: newStepType,
        config: {}
      });
      mutate();
      setIsAddStepOpen(false);
      setNewStepName('');
    } catch (err: any) {
      setAddError(err.message || 'Failed to add step. Permission denied.');
    } finally {
      setIsAdding(false);
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
                workflow.status === 'active' ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'
              }`}>
                {workflow.status}
              </span>
              <span className="text-xs text-gray-400">ID: {workflow.id}</span>
            </div>
          </div>
          {!isViewer && (
            <button
              onClick={handleRunWorkflow}
              disabled={isRunning}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Running...' : 'Run Workflow'}
            </button>
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
                      <option value="transform">Data Transform</option>
                      <option value="db_write" disabled={isEditor}>Database Write (Owner Only)</option>
                      <option value="notify" disabled={isEditor}>Notification (Owner Only)</option>
                    </select>
                  </div>
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
                  <li key={step.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-500">
                        {index + 1}
                      </span>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-900">{step.name}</p>
                        <p className="text-sm text-gray-500 font-mono text-xs">{step.type}</p>
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
            <div className="border-b border-gray-200 px-4 py-5 sm:px-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Triggers</h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              {workflow.workflow_triggers.length === 0 ? (
                <p className="text-sm text-gray-500">No triggers defined. Workflow must be triggered manually.</p>
              ) : (
                <ul className="space-y-2">
                  {workflow.workflow_triggers.map((t: any) => (
                    <li key={t.id} className="text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100">
                      Type: <span className="font-mono font-medium">{t.type}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white shadow sm:rounded-lg">
            <div className="border-b border-gray-200 px-4 py-5 sm:px-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Recent Runs</h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <ul className="divide-y divide-gray-100">
                {workflow.workflow_runs.length === 0 ? (
                  <p className="text-sm text-gray-500">No runs recorded.</p>
                ) : (
                  workflow.workflow_runs.map((run: any) => (
                    <li key={run.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center">
                        {run.status === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                         run.status === 'failed' ? <XCircle className="h-5 w-5 text-red-500" /> : 
                         <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />}
                        <span className="ml-3 text-sm text-gray-700">{new Date(run.started_at).toLocaleString()}</span>
                      </div>
                      <span className="text-xs font-mono text-gray-500">{run.id.substring(0, 8)}</span>
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
