# Phase 3 Implementation Documentation

## Overview
Phase 3 establishes the Next.js frontend application, built entirely on top of the frozen Phase 2 Nhost Cloud backend. It implements authentication, a role-aware UX, dynamic GraphQL querying, and an organization-bound context.

## Frontend Architecture
- **Framework**: Next.js 16.3.0 App Router
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS v4
- **State/Caching**: `swr` for client-side data fetching
- **GraphQL Client**: `graphql-request` configured to auto-inject the Nhost access token

## Authentication Flow
- Handled primarily by `@nhost/nextjs` and `@nhost/react` in Client Components.
- A central `/auth` route provides Sign In and Sign Up capabilities.
- Nhost's email verification requirement is respected: if a user signs up but a session is not immediately returned, a dedicated "Check your email" UI is displayed instead of a generic error or bypass.
- **Protected Routes**: The `ProtectedRoute` component explicitly guards the `/(app)` route group, intercepting unauthenticated users and routing them back to `/auth`.

## Organization Context
- Located at `src/components/layout/OrganizationContext.tsx`.
- Retrieves the user's available organizations by querying `org_members` upon successful authentication.
- Provides a globally accessible context containing:
  - `memberships`
  - `activeOrg`
  - `activeRole`
  - `setActiveOrgId`
- All application mutations strictly provide the `activeOrg.id` to the backend. The backend `insert_permissions` guarantee that this ID cannot be maliciously swapped to an organization the user does not belong to.

## GraphQL Integration
- Centralized in `src/lib/graphql.ts`.
- Uses a `fetcher` adapter compatible with `swr`.
- Dynamically fetches the current token from `nhost.auth.getAccessToken()` on every request, ensuring expired tokens do not cause stale requests.
- Queries mirror the exact deployed Phase 2 schema (e.g., querying `workflow_steps` and `workflow_runs`).

## Dashboard & Workflow UI
- **Dashboard**: Aggregates total workflows and lists the 5 most recent workflows and execution runs via relational queries.
- **Workflow List**: Allows viewing workflows. Authorized roles can create workflows via a modal.
- **Workflow Details**: Displays the workflow structure (steps, triggers). Authorized roles can add new steps, with restrictions on step types (e.g., `db_write` is visually disabled for Editors).

## Role-Aware UX
The application implements UX constraints based on the `activeRole` (Owner, Editor, Viewer) returned by the Organization Context:
- **Viewer**: "Create Workflow" and "Add Step" buttons are hidden entirely.
- **Editor**: Can add generic steps, but restricted step types (like `db_write` and `notify`) are disabled in the dropdowns.
- **Owner**: Has full UI access.

*(Note: These role constraints are purely visual UX. Hasura enforces the true security boundaries at the API layer based on the Phase 2 RBAC metadata.)*

## Error Handling
- Network and GraphQL permission errors are caught by `swr`. 
- Error boundaries and inline alerts gracefully inform the user if a resource cannot be loaded or a mutation is denied, abstracting away complex Hasura constraint violation messages into user-friendly notices.

## Validation Results
- **TypeScript/Build**: Succeeded.
- **Lint**: Succeeded.
- **No Secrets Exposed**: `.env.local` remains ignored and all Nhost connection values use safe `NEXT_PUBLIC_` prefixes.
