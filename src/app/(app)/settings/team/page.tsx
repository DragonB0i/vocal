/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useOrganization } from '@/components/layout/OrganizationContext';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { Loader2, Users, AlertCircle, UserPlus, Shield, ShieldOff } from 'lucide-react';

const GET_TEAM_MEMBERS = `
  query GetTeamMembers($orgId: uuid!) {
    org_members(where: {org_id: {_eq: $orgId}}, order_by: {created_at: asc}) {
      id
      role
      user_id
      created_at
      user {
        email
        display_name
      }
    }
  }
`;

export default function TeamPage() {
  const { activeOrg, activeRole, isLoading: isOrgLoading } = useOrganization();
  const orgId = activeOrg?.id;

  const { data, error, isLoading, mutate } = useSWR(
    orgId ? [GET_TEAM_MEMBERS, { orgId }] : null,
    ([query, variables]) => fetcher(query, variables)
  );

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const isOwner = activeRole === 'owner';

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteRole || !orgId) return;

    setIsInviting(true);
    setInviteError('');
    setInviteSuccess('');

    try {
      const { nhost } = await import('@/lib/nhost');
      const { res, error: fnError } = await nhost.functions.call('add-member', {
        orgId,
        email: inviteEmail.trim(),
        role: inviteRole
      });

      if (fnError) {
        setInviteError(fnError.message || 'Failed to add member');
      } else if ((res?.data as any)?.errors) {
        setInviteError((res.data as any).errors[0]?.message || 'Failed to add member');
      } else if ((res?.data as any)?.message) {
         setInviteError((res.data as any).message);
      } else {
        setInviteSuccess(`Successfully added ${inviteEmail}`);
        setInviteEmail('');
        mutate();
      }
    } catch (err: any) {
      setInviteError(err.message || 'An unexpected error occurred');
    } finally {
      setIsInviting(false);
    }
  };

  if (isOrgLoading || (isLoading && !error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !activeOrg) {
    return (
      <div className="rounded-md bg-red-50 p-4 border border-red-200 m-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Access Denied</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>Cannot load team data.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const members = data?.org_members || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Team Management</h1>
        <p className="text-sm text-gray-500">Manage members for {activeOrg.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Member List */}
        <div className="lg:col-span-2 overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-400" />
              Organization Members ({members.length})
            </h3>
          </div>
          <ul role="list" className="divide-y divide-gray-200">
            {members.length === 0 ? (
              <li className="px-4 py-5 text-sm text-gray-500 text-center">No members found.</li>
            ) : (
              members.map((member: any) => (
                <li key={member.id} className="px-4 py-4 sm:px-6 flex items-center justify-between">
                  <div className="flex flex-col">
                    <p className="font-medium text-gray-900">
                      {member.user?.email || member.user?.display_name || 'Hidden User Data (Restricted)'}
                    </p>
                    <p className="text-sm text-gray-500 font-mono text-xs mt-1">ID: {member.user_id}</p>
                  </div>
                  <div>
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      member.role === 'owner' ? 'bg-purple-50 text-purple-700 ring-purple-600/20' : 
                      member.role === 'editor' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                      'bg-gray-50 text-gray-700 ring-gray-600/20'
                    }`}>
                      {member.role}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Invite Form */}
        <div className="overflow-hidden rounded-lg bg-white shadow self-start">
          <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-gray-400" />
              Add Member
            </h3>
          </div>
          <div className="p-4 sm:p-6">
            {!isOwner ? (
              <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
                <div className="flex">
                  <ShieldOff className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">Owner Access Required</h3>
                    <p className="mt-2 text-sm text-yellow-700">Only organization owners can add new members.</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    placeholder="colleague@example.com"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    User must already be registered and verified.
                  </p>
                </div>
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    id="role"
                    name="role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="viewer">Viewer (Read-only)</option>
                    <option value="editor">Editor (Can execute & edit)</option>
                  </select>
                </div>

                {inviteError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="rounded-md bg-green-50 p-3 text-sm text-green-600 border border-green-200">
                    {inviteSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isInviting}
                  className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-70"
                >
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  {isInviting ? 'Adding...' : 'Add Member'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
