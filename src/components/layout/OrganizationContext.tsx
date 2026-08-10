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
