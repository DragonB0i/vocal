/* eslint-disable @typescript-eslint/no-explicit-any */
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

  const { data, isLoading, mutate } = useSWR(
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
      <OnboardingScreen onComplete={() => mutate()} />
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

function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    setIsSubmitting(true);
    setError('');

    try {
      const { nhost } = await import('@/lib/nhost');
      const { res, error: fnError } = await nhost.functions.call('seed-org', { name, slug });
      
      if (fnError) {
        setError(fnError.message || 'Failed to create workspace');
      } else if ((res?.data as any)?.errors) {
        setError((res.data as any).errors[0]?.message || 'Failed to create workspace');
      } else {
        onComplete();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-6">
      <div className="mx-auto w-full max-w-md rounded-xl bg-white p-8 shadow-lg text-center">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Create Your Workspace</h2>
        <p className="mt-2 text-sm text-gray-500">
          Get started by creating your first organization.
        </p>
        
        <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-left">
          <div>
            <label htmlFor="org-name" className="block text-sm font-medium text-gray-700">Workspace Name</label>
            <input
              id="org-name"
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')) {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
                }
              }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label htmlFor="org-slug" className="block text-sm font-medium text-gray-700">Workspace Slug</label>
            <input
              id="org-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="acme-corp"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function useOrganization() {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
