/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, AlertCircle, Activity, LayoutTemplate, Clock } from 'lucide-react';
import Link from 'next/link';

const GET_DASHBOARD_DATA = `
  query GetDashboardData($orgId: uuid!) {
    workflows_aggregate(where: {org_id: {_eq: $orgId}}) {
      aggregate {
        count
      }
    }
    completed_runs: workflow_runs_aggregate(where: {workflow: {org_id: {_eq: $orgId}}, status: {_eq: "completed"}}) {
      aggregate {
        count
      }
    }
    active_runs: workflow_runs_aggregate(where: {workflow: {org_id: {_eq: $orgId}}, status: {_in: ["running", "paused", "pending"]}}) {
      aggregate {
        count
      }
    }
    failed_runs: workflow_runs_aggregate(where: {workflow: {org_id: {_eq: $orgId}}, status: {_eq: "failed"}}) {
      aggregate {
        count
      }
    }
    workflows(where: {org_id: {_eq: $orgId}}, order_by: {created_at: desc}, limit: 5) {
      id
      name
      status
      created_at
    }
    workflow_runs(where: {workflow: {org_id: {_eq: $orgId}}}, order_by: {created_at: desc}, limit: 5) {
      id
      status
      started_at
      workflow {
        name
      }
    }
    notifications(where: {org_id: {_eq: $orgId}}, order_by: {created_at: desc}, limit: 5) {
      id
      title
      message
      created_at
      workflow_run {
        workflow {
          name
        }
      }
    }
  }
`;

export default function DashboardPage() {
  const { activeOrg, isLoading: isOrgLoading } = useOrganization();
  const orgId = activeOrg?.id;

  const { data, error, isLoading } = useSWR(
    orgId ? [GET_DASHBOARD_DATA, { orgId }] : null,
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
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>Hasura returned a permission denied error or network failure.</p>
            </div>
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

  const workflowCount = data?.workflows_aggregate?.aggregate?.count || 0;
  const completedCount = data?.completed_runs?.aggregate?.count || 0;
  const activeCount = data?.active_runs?.aggregate?.count || 0;
  const failedCount = data?.failed_runs?.aggregate?.count || 0;
  const recentRuns = data?.workflow_runs || [];
  const recentNotifications = data?.notifications || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview for {activeOrg.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <LayoutTemplate className="h-6 w-6 text-indigo-400" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="truncate text-sm font-medium text-gray-500">Total Workflows</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">{workflowCount}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link href="/workflows" className="font-medium text-indigo-700 hover:text-indigo-900">
                View workflows
              </Link>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Activity className="h-6 w-6 text-green-500" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="truncate text-sm font-medium text-gray-500">Completed</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">{completedCount}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link href="/runs" className="font-medium text-indigo-700 hover:text-indigo-900">
                View all runs
              </Link>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-6 w-6 text-yellow-500" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="truncate text-sm font-medium text-gray-500">Active / Paused</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">{activeCount}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link href="/runs" className="font-medium text-indigo-700 hover:text-indigo-900">
                View active runs
              </Link>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="truncate text-sm font-medium text-gray-500">Failed Executions</dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">{failedCount}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link href="/runs" className="font-medium text-indigo-700 hover:text-indigo-900">
                Review failures
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Runs */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 bg-white px-4 py-5 sm:flex sm:items-center sm:justify-between sm:px-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">Recent Executions</h3>
            <div className="mt-3 sm:ml-4 sm:mt-0">
              <Link href="/runs" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">View all</Link>
            </div>
          </div>
          <ul role="list" className="divide-y divide-gray-200">
            {recentRuns.length === 0 ? (
              <li className="px-4 py-5 text-sm text-gray-500 text-center">No runs executed yet.</li>
            ) : (
              recentRuns.map((run: any) => (
                <li key={run.id} className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="truncate">
                      <p className="truncate font-medium text-gray-900">{run.workflow.name}</p>
                      <p className="mt-1 flex items-center text-sm text-gray-500">
                        <Activity className="mr-1.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                        {new Date(run.started_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="ml-2 flex flex-shrink-0">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        run.status === 'completed' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                        run.status === 'failed' ? 'bg-red-50 text-red-700 ring-red-600/10' :
                        'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                      }`}>
                        {run.status}
                      </span>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Recent Notifications */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 bg-white px-4 py-5 sm:flex sm:items-center sm:justify-between sm:px-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">Recent Notifications</h3>
            <div className="mt-3 sm:ml-4 sm:mt-0">
              <Link href="/notifications" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">View all</Link>
            </div>
          </div>
          <ul role="list" className="divide-y divide-gray-200">
            {recentNotifications.length === 0 ? (
              <li className="px-4 py-5 text-sm text-gray-500 text-center">No notifications found.</li>
            ) : (
              recentNotifications.map((notif: any) => (
                <li key={notif.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                  <div className="flex flex-col">
                    <div className="flex justify-between items-start">
                      <p className="font-medium text-gray-900 text-sm">{notif.title}</p>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">{notif.message}</p>
                    {notif.workflow_run?.workflow && (
                      <p className="mt-2 text-xs text-indigo-600 font-medium">Source: {notif.workflow_run.workflow.name}</p>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
