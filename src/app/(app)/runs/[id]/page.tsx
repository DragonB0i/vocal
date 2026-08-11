/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, AlertCircle, CheckCircle2, XCircle, Clock, ArrowLeft, Terminal, Activity } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const GET_RUN_DETAILS = `
  query GetRunDetails($id: uuid!, $orgId: uuid!) {
    workflow_runs(where: {id: {_eq: $id}, workflow: {org_id: {_eq: $orgId}}}) {
      id
      status
      started_at
      completed_at
      workflow {
        id
        name
      }
      step_runs(order_by: {created_at: asc}) {
        id
        status
        started_at
        completed_at
        input
        output
        error
        attempt_count
        workflow_step {
          name
          type
        }
      }
    }
  }
`;

export default function RunDetailsPage() {
  const { id } = useParams() as { id: string };
  const { activeOrg, isLoading: isOrgLoading } = useOrganization();
  const orgId = activeOrg?.id;

  const { data, error, isLoading } = useSWR(
    orgId ? [GET_RUN_DETAILS, { id, orgId }] : null,
    ([query, variables]) => fetcher(query, variables),
    { refreshInterval: 5000 } // Poll every 5s for live updates
  );

  if (isOrgLoading || (isLoading && !error && !data)) {
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
            <h3 className="text-sm font-medium text-red-800">Error loading run details</h3>
            <p className="mt-2 text-sm text-red-700">Permission denied or network failure.</p>
          </div>
        </div>
      </div>
    );
  }

  const run = data?.workflow_runs?.[0];

  if (!run) {
    return (
      <div className="text-center py-12">
        <h3 className="mt-2 text-sm font-semibold text-gray-900">Run Not Found</h3>
        <p className="mt-1 text-sm text-gray-500">The execution run may not exist or belong to another organization.</p>
        <div className="mt-6">
          <Link href="/runs" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            &larr; Back to all runs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Link href="/runs" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to runs
        </Link>
      </div>

      <div className="sm:flex sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Terminal className="h-6 w-6 text-gray-400" />
            Execution: {run.id.split('-')[0]}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Workflow: <Link href={`/workflows/${run.workflow.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">{run.workflow.name}</Link>
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center gap-2">
          <span className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium ring-1 ring-inset ${
            run.status === 'completed' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
            run.status === 'failed' ? 'bg-red-50 text-red-700 ring-red-600/10' :
            run.status === 'paused' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' :
            'bg-blue-50 text-blue-700 ring-blue-600/20'
          }`}>
            {run.status === 'running' || run.status === 'pending' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {run.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Run Summary</h3>
            </div>
            <div className="px-4 py-5 sm:p-6 space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Started</dt>
                <dd className="mt-1 text-sm text-gray-900">{run.started_at ? new Date(run.started_at).toLocaleString() : 'Pending'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Completed</dt>
                <dd className="mt-1 text-sm text-gray-900">{run.completed_at ? new Date(run.completed_at).toLocaleString() : '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Duration</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {run.completed_at && run.started_at ? 
                    `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s` : 
                    '-'
                  }
                </dd>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Execution Timeline</h3>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <div className="flow-root">
                <ul role="list" className="-mb-8">
                  {run.step_runs?.length === 0 ? (
                     <li className="text-sm text-gray-500 text-center py-4">No steps executed yet.</li>
                  ) : null}
                  
                  {run.step_runs?.map((step: any, stepIdx: number) => (
                    <li key={step.id}>
                      <div className="relative pb-8">
                        {stepIdx !== run.step_runs.length - 1 ? (
                          <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                        ) : null}
                        <div className="relative flex space-x-3">
                          <div>
                            <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                              step.status === 'completed' ? 'bg-green-500' :
                              step.status === 'failed' ? 'bg-red-500' :
                              step.status === 'paused' ? 'bg-yellow-500' :
                              'bg-blue-500'
                            }`}>
                              {step.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-white" /> :
                               step.status === 'failed' ? <XCircle className="h-5 w-5 text-white" /> :
                               step.status === 'paused' ? <Clock className="h-5 w-5 text-white" /> :
                               <Activity className="h-5 w-5 text-white animate-pulse" />}
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                            <div className="w-full">
                              <p className="text-sm text-gray-500">
                                <span className="font-medium text-gray-900 mr-2">{step.workflow_step.name}</span>
                                <span className="text-xs uppercase bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{step.workflow_step.type}</span>
                              </p>
                              <div className="mt-2 text-sm text-gray-700">
                                <span className="font-semibold text-xs">Status:</span> <span className="capitalize">{step.status}</span>
                                {step.attempt_count > 0 && <span className="ml-3 text-xs text-gray-500">(Retries: {step.attempt_count})</span>}
                              </div>
                              
                              {step.error && (
                                <div className="mt-2 bg-red-50 p-3 rounded-md border border-red-100">
                                  <pre className="text-xs text-red-800 whitespace-pre-wrap font-mono">
                                    {JSON.stringify(step.error, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {step.output && (
                                <div className="mt-2 bg-gray-50 p-3 rounded-md border border-gray-200">
                                  <div className="text-xs font-semibold text-gray-500 mb-1">Output Payload</div>
                                  <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono overflow-auto max-h-48">
                                    {JSON.stringify(step.output, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                            <div className="whitespace-nowrap text-right text-sm text-gray-500">
                              <time dateTime={step.started_at}>{new Date(step.started_at).toLocaleTimeString()}</time>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
