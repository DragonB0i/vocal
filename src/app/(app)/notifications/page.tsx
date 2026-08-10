/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, AlertCircle, Bell, MessageSquare, Clock } from 'lucide-react';
import Link from 'next/link';

const GET_NOTIFICATIONS = `
  query GetNotifications($orgId: uuid!) {
    notifications(
      where: {org_id: {_eq: $orgId}}, 
      order_by: {created_at: desc}, 
      limit: 50
    ) {
      id
      title
      message
      type
      created_at
      workflow_run {
        id
        workflow {
          id
          name
        }
      }
    }
  }
`;

export default function NotificationsPage() {
  const { activeOrg, isLoading: isOrgLoading } = useOrganization();
  const orgId = activeOrg?.id;

  const { data, error, isLoading } = useSWR(
    orgId ? [GET_NOTIFICATIONS, { orgId }] : null,
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
            <h3 className="text-sm font-medium text-red-800">Error loading notifications</h3>
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

  const notifications = data?.notifications || [];

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-gray-400" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            System alerts and workflow notifications for {activeOrg.name}.
          </p>
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {notifications.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500">No notifications found.</li>
          ) : (
            notifications.map((notification: any) => (
              <li key={notification.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <MessageSquare className="h-6 w-6 text-indigo-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="text-sm font-semibold text-gray-900">{notification.title}</h4>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                    
                    {notification.workflow_run?.workflow && (
                      <div className="mt-2">
                        <Link 
                          href={`/workflows/${notification.workflow_run.workflow.id}`}
                          className="inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-2 py-1 rounded"
                        >
                          Source: {notification.workflow_run.workflow.name}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
