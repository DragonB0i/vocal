'use client';

import { useSignOut, useUserData } from '@nhost/nextjs';
import { useOrganization } from './OrganizationContext';
import { LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Header() {
  const { signOut } = useSignOut();
  const user = useUserData();
  const router = useRouter();
  const { memberships, activeOrg, activeRole, setActiveOrgId } = useOrganization();

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-4">
        {memberships.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="org-selector" className="text-sm font-medium text-gray-500">
              Workspace:
            </label>
            <select
              id="org-selector"
              className="block w-48 rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-gray-50 hover:bg-white transition-colors"
              value={activeOrg?.id || ''}
              onChange={(e) => setActiveOrgId(e.target.value)}
            >
              {memberships.map((m) => (
                <option key={m.organization.id} value={m.organization.id}>
                  {m.organization.name}
                </option>
              ))}
            </select>
            {activeRole && (
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10 uppercase ml-2">
                {activeRole}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 border-r border-gray-200 pr-4">
          <User className="h-4 w-4" />
          <span>{user?.email}</span>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </header>
  );
}
