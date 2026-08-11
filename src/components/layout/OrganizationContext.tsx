'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/graphql';
import { useAuthenticationStatus, useUserData } from '@nhost/nextjs';
import { Loader2 } from 'lucide-react';

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type Membership = {
  role: string;
  organization: Organization;
};

type OrgContextType = {
  memberships: Membership[];
  activeOrg: Organization | null;
  activeRole: string | null;
  setActiveOrgId: (id: string) => void;
  isLoading: boolean;
};

const OrgContext = createContext<OrgContextType | undefined>(undefined);

const GET_USER_ORGS = `
  query GetUserOrgs($userId: uuid!) {
    org_members(where: {user_id: {_eq: $userId}}) {
      role
      organization {
        id
        name
        slug
      }
    }
  }
`;

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthenticationStatus();
  const user = useUserData();
  const userId = user?.id;

  const { data, isLoading } = useSWR(
    isAuthenticated && userId ? [GET_USER_ORGS, { userId }] : null,
    ([query, variables]) => fetcher(query, variables)
  );

  const memberships: Membership[] = data?.org_members || [];
  
  const [activeOrgIdState, setActiveOrgIdState] = useState<string | null>(null);

  const activeOrgId = activeOrgIdState || (memberships.length > 0 ? memberships[0].organization.id : null);
  const setActiveOrgId = setActiveOrgIdState;

  const activeMembership = memberships.find(m => m.organization.id === activeOrgId);
  const activeOrg = activeMembership?.organization || null;
  const activeRole = activeMembership?.role || null;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-6">
        <div className="mx-auto max-w-md text-center">
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">No Organizations Found</h2>
          <p className="mt-4 text-sm text-gray-500">
            You are not a member of any organization. Please contact your administrator to be invited to a workspace, or check back later.
          </p>
          <div className="mt-6">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <OrgContext.Provider value={{
      memberships,
      activeOrg,
      activeRole,
      setActiveOrgId,
      isLoading
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
