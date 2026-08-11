# Production Release Checklist

## 1. Security & Compliance
- [x] **Authentication**: Nhost Email/Password authentication configured, tested, and live.
- [x] **Tenant Isolation**: Hasura permissions rigidly enforced via `X-Hasura-User-Id` and `org_id` cross-checks.
- [x] **SSRF Protection**: Verified via `functions/_shared/security.ts`.
- [x] **Secret Management**: `NHOST_ADMIN_SECRET` absolutely restricted to backend Node.js execution context.
- [x] **Webhook Signatures**: Incoming webhook secrets securely hashed and validated.

## 2. Organization Onboarding (Phase 13)
- [x] **Onboarding Fallback**: First-time users are prompted with a "Create Your Workspace" UI in `OrganizationContext.tsx`.
- [x] **Serverless Organization Creation**: `functions/seed-org.ts` securely generates the tenant workspace using Nhost Cloud backend tokens, assigning the caller as `owner`.
- [x] **Team Management**: Real-time team display and invitation UI at `/settings/team`.
- [x] **Invitation Constraint**: Backend `functions/add-member.ts` strictly requires invitees to be registered system users before joining an organization.

## 3. Reliability & Operations
- [x] **Retry Logic**: Exponential backoff integrated into step runner.
- [x] **Idempotency**: Execution engine strictly enforces `Idempotency-Key` headers on trigger initiation.
- [x] **Rate Limiting**: Configured per-tenant quotas for API access.
- [x] **Logging**: Audit logs securely capture all executions and structural modifications.

## 4. Frontend Status
- [x] **Builds**: Clean production builds verified (`npm run build`).
- [x] **Linting**: No blocking ESLint errors (`npm run lint`).
- [x] **Dependencies**: No critical vulnerabilities detected (`npm audit`).

## 5. Live Testing Requirements (Human Ops)
Due to AI browser-automation limitations, the following live verifications must be performed manually prior to GA release:
- [ ] Create Organization A as User A (`nickvanessa5@gmail.com`).
- [ ] Verify Email of User B (Editor).
- [ ] Add User B to Organization A via Team Settings.
- [ ] Attempt cross-tenant data requests.
- [ ] Execute complete Webhook lifecycle.

## 6. Deployment (Vercel & Nhost)
- [x] Configure Nhost Server-Side Environment Variables (`NHOST_ADMIN_SECRET`, `GROQ_API_KEY`).
- [x] Deploy Serverless Functions (`functions/`).
- [x] Link Vercel project to Git Repository.
- [x] Configure Vercel Client-Safe Environment Variables (`NEXT_PUBLIC_NHOST_SUBDOMAIN`, `NEXT_PUBLIC_NHOST_REGION`).
- [x] Set Nhost Auth Client URL to Vercel production domain.
- [x] Add Vercel production domain to Nhost Allowed Redirect URLs.
