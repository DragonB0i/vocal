# Organization Onboarding & Team Management

## Overview
Phase 13 introduced the crucial self-service onboarding and team management layer necessary for a complete multi-tenant experience. These features enable verified users to create workspaces and invite other registered users to collaborate securely without relying on out-of-band administration.

## 1. Onboarding (`OrganizationContext.tsx`)
When a verified Nhost user logs into the application and possesses zero organization memberships, they are presented with a "Create Your Workspace" screen rather than a dead-end message.

- **Mechanism**: The user provides a workspace name and slug. The frontend calls the existing `seed-org` Nhost Serverless Function.
- **Security Boundary**: The frontend cannot assert ownership directly via GraphQL because the `public_organizations` table has no insert permissions for the `user` role. `seed-org.ts` uses the securely managed `x-hasura-admin-secret` to perform the mutation and assigns the caller as the `owner`.

## 2. Team Management (`/settings/team`)
Owners can manage their organization's members through the Team Management interface.

- **Constraint**: Because the frozen Phase 2 schema does not contain an `invitations` table, pending invitations for unregistered emails are impossible. Users must sign up and verify their email first before they can be added to an organization.
- **Mechanism**: The frontend collects the registered email and desired role (Editor, Viewer) and calls the `add-member` Nhost Serverless Function.
- **Security Boundary**: The `add-member.ts` function:
  1. Authenticates the caller.
  2. Verifies the caller is an `owner` of the target organization.
  3. Looks up the target user's `id` from the `auth.users` table using the Admin Secret (bypassing the GraphQL privacy restriction that prevents users from looking up other users).
  4. Inserts the `org_members` record with the explicitly requested role (owner role cannot be granted).

## 3. RBAC (Role-Based Access Control)
- **Owner**: Full access. Can create webhooks, execute runs, approve gates, and manage team members.
- **Editor**: Can configure and execute workflows but cannot access team management or webhook deletion (as dictated by frozen schema).
- **Viewer**: Read-only access to workflows and runs. Mutations are rejected by Hasura.
