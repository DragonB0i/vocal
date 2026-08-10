/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, Plus, AlertCircle, Play, MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const GET_WORKFLOWS = `
  query GetWorkflows($orgId: uuid!) {
    workflows(where: {org_id: {_eq: $orgId}}, order_by: {created_at: desc}) {
      id
      name
      description
      status
      created_at
    }
  }
`;

const CREATE_WORKFLOW = `
  mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String) {
    insert_workflows_one(object: {org_id: $orgId, name: $name, description: $description}) {
      id
    }
  }
`;

export default function WorkflowsPage() {
  const { activeOrg, activeRole, isLoading: isOrgLoading } = useOrganization();
  const orgId = activeOrg?.id;
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR(
    orgId ? [GET_WORKFLOWS, { orgId }] : null,
    ([query, variables]) => fetcher(query, variables)
  );

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isViewer = activeRole === 'viewer';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await fetcher(CREATE_WORKFLOW, {
        orgId,
        name: newWorkflowName,
        description: newWorkflowDescription || null
      });
      if (res.insert_workflows_one) {
        mutate();
        setIsCreateModalOpen(false);
        setNewWorkflowName('');
        setNewWorkflowDescription('');
        router.push(`/workflows/${res.insert_workflows_one.id}`);
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create workflow. You may not have permission.');
    } finally {
      setIsCreating(false);
    }
  };

  if (isOrgLoading || (isLoading && !error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading workflows</h3>
          </div>
        </div>
      </div>
    );
  }

  const workflows = data?.workflows || [];

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage automation workflows for {activeOrg?.name}
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          {!isViewer && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> Create Workflow
              </span>
            </button>
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
          <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <form onSubmit={handleCreate}>
                  <div>
                    <div className="mt-3 text-center sm:mt-5">
                      <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">Create New Workflow</h3>
                      <div className="mt-4 space-y-4 text-left">
                        <div>
                          <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">Name</label>
                          <div className="mt-2">
                            <input type="text" name="name" id="name" required value={newWorkflowName} onChange={e => setNewWorkflowName(e.target.value)} className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3" />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="desc" className="block text-sm font-medium leading-6 text-gray-900">Description (Optional)</label>
                          <div className="mt-2">
                            <textarea id="desc" name="desc" rows={3} value={newWorkflowDescription} onChange={e => setNewWorkflowDescription(e.target.value)} className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {createError && (
                    <div className="mt-4 text-sm text-red-600 bg-red-50 p-2 rounded">{createError}</div>
                  )}
                  <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button type="submit" disabled={isCreating} className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-70">
                      {isCreating ? 'Creating...' : 'Create'}
                    </button>
                    <button type="button" disabled={isCreating} onClick={() => setIsCreateModalOpen(false)} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden bg-white shadow sm:rounded-md">
        <ul role="list" className="divide-y divide-gray-200">
          {workflows.length === 0 ? (
            <li className="px-6 py-12 text-center">
              <Play className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No workflows</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating a new workflow.</p>
              {!isViewer && (
                <div className="mt-6">
                  <button onClick={() => setIsCreateModalOpen(true)} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                    <Plus className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                    New Workflow
                  </button>
                </div>
              )}
            </li>
          ) : (
            workflows.map((workflow: any) => (
              <li key={workflow.id}>
                <Link href={`/workflows/${workflow.id}`} className="block hover:bg-gray-50">
                  <div className="flex items-center px-4 py-4 sm:px-6">
                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between">
                      <div className="truncate">
                        <div className="flex text-sm">
                          <p className="truncate font-medium text-indigo-600">{workflow.name}</p>
                        </div>
                        <div className="mt-2 flex">
                          <div className="flex items-center text-sm text-gray-500">
                            <p>{workflow.description || 'No description provided.'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex-shrink-0 sm:ml-5 sm:mt-0">
                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                            workflow.status === 'active' ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'
                          }`}>
                            {workflow.status}
                          </span>
                          <p className="text-xs text-gray-400">Created {new Date(workflow.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                    <div className="ml-5 flex-shrink-0">
                      <MoreVertical className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
