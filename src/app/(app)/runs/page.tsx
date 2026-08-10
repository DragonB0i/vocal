/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, AlertCircle, CheckCircle2, XCircle, Clock, Activity } from 'lucide-react';
import Link from 'next/link';

const GET_GLOBAL_RUNS = `
  query GetGlobalRuns($orgId: uuid!) {
    workflow_runs(
      where: {workflow: {org_id: {_eq: $orgId}}}, 
      order_by: {created_at: desc}, 
      limit: 50
    ) {
      id
      status
      started_at
      completed_at
      workflow {
        id
        name
      }
    }
  }
`;

export default function GlobalRunsPage() {
  const { activeOrg, isLoading: isOrgLoading } = useOrganization();
  const orgId = activeOrg?.id;

  const { data, error, isLoading } = useSWR(
    orgId ? [GET_GLOBAL_RUNS, { orgId }] : null,
    ([query, variables]) => fetcher(query, variables)
  );

  if (isOrgLoading || (isLoading && !error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 border border-red-200">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading runs</h3>
            <p className="mt-2 text-sm text-red-700">Permission denied or network failure.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div className="text-center py-12">
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No Organization Selected</h3>
        <p className="mt-1 text-sm text-gray-500">You do not belong to any organizations.</p>
      </div>
    );
  }

  const runs = data?.workflow_runs || [];

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-gray-400" />
            Global Execution Runs
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Recent workflow executions across all workflows in {activeOrg.name}.
          </p>
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {runs.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500">No workflow runs found in this organization.</li>
          ) : (
            runs.map((run: any) => (
              <li key={run.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {run.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                     run.status === 'failed' ? <XCircle className="h-5 w-5 text-red-500" /> : 
                     run.status === 'paused' ? <Clock className="h-5 w-5 text-yellow-500" /> : 
                     <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                    
                    <div>
                      <Link href={`/workflows/${run.workflow.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-900">
                        {run.workflow.name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        <span className="capitalize">{run.status}</span>
                        <span>&bull;</span>
                        <span>{new Date(run.started_at).toLocaleString()}</span>
                        {run.completed_at && (
                          <>
                            <span>&bull;</span>
                            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s
                            </span>
                          </>
                        )}
                        <span>&bull;</span>
                        <span className="font-mono text-gray-400">Run ID: {run.id}</span>
                      </div>
                    </div>
                  </div>
                  <Link 
                    href={`/workflows/${run.workflow.id}`}
                    className="hidden sm:block text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded px-2 py-1 shadow-sm hover:bg-gray-50"
                  >
                    View Details
                  </Link>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
