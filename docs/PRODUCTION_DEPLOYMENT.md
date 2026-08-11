# Production Deployment Guide

This document outlines the architecture and deployment procedures for the production release of the application.

## 1. Architecture
The application consists of three main components:
1. **Frontend**: Next.js (App Router, v16.3.0)
2. **Backend/Database**: Nhost (Hasura GraphQL API + PostgreSQL Database)
3. **Serverless Functions**: Nhost Serverless Functions (Node.js)

```text
                    ┌──────────────────────┐
                    │      Next.js UI      │
                    │      Production      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Nhost GraphQL     │
                    │ Auth + PostgreSQL +  │
                    │       Hasura         │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Nhost Functions    │
                    │ Workflow execution   │
                    │ Webhooks / security  │
                    └──────────────────────┘
```

## 2. Environment Variables

### Client-Safe (Public)
These variables MUST be provided to your frontend hosting provider (e.g. Vercel) and can be exposed to the browser.
* `NEXT_PUBLIC_NHOST_SUBDOMAIN`
* `NEXT_PUBLIC_NHOST_REGION`

### Server-Only (Private Secrets)
These variables MUST be configured securely within your Nhost Cloud environment and **NEVER** exposed to the frontend deployment.
* `NHOST_ADMIN_SECRET`: Required by serverless functions to securely query internal data or mutate organization metadata.
* `GROQ_API_KEY`: Required by the `llm_generate` advanced step.
* *Webhook Secrets*: Stored encrypted/hashed directly in the database, never configured manually in env.

## 3. Deployment Steps

### Step A: Nhost Backend & Functions
1. Create a project in [Nhost Cloud](https://nhost.io/).
2. Apply the frozen Phase 2 database schema.
3. Configure the `NHOST_ADMIN_SECRET` and `GROQ_API_KEY` under Settings -> Environment Variables.
4. Set the **Client URL** in Settings -> Authentication to your upcoming frontend production domain (e.g., `https://my-app.vercel.app`).
5. Ensure `Allowed Redirect URLs` include your production domain.
6. Deploy your `functions/` directory via the Nhost CLI or GitHub integration.

### Step B: Next.js Frontend (Vercel)
1. Import the Git repository into Vercel (or preferred hosting provider).
2. The provider will automatically detect Next.js.
3. Add your Environment Variables:
   - `NEXT_PUBLIC_NHOST_SUBDOMAIN`
   - `NEXT_PUBLIC_NHOST_REGION`
4. Deploy the application.

## 4. Webhook URL Format
After deploying the Nhost functions, your webhook execution endpoint will follow this format:
`https://<nhost-subdomain>.functions.<nhost-region>.nhost.run/v1/webhook?triggerId=<UUID>`
The application automatically constructs this string based on your `NEXT_PUBLIC_NHOST_*` variables when an Owner requests a new webhook trigger.

## 5. Security Headers
The application enforces strict security headers via `next.config.ts`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

Ensure your hosting provider respects these headers.

## 6. Rollback Procedure
If a critical production error occurs:
1. Revert to the previous known-good Git commit (`f19e4a3`).
2. Trigger a redeployment of the Next.js frontend on Vercel.
3. Redeploy the Nhost functions via Nhost CLI (`nhost run deploy`).
4. **DO NOT** attempt a database rollback or schema mutation. The Phase 2 schema is strictly frozen and backwards compatible.
5. Verify Nhost Configuration and run a manual smoke test.
