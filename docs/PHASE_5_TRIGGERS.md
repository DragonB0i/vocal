# Phase 5: Workflow Triggers & Automation

This document outlines the architecture, security, and limitations of the workflow trigger automation implemented in Phase 5.

## Supported Trigger Types

The `workflow_triggers` table restricts `type` via a `CHECK` constraint to:
1. `manual`: Implicit trigger, can be executed manually by `owner` or `editor`.
2. `webhook`: An external HTTP request that triggers execution, configured with a cryptographically secure secret.

### Known Limitation: Schedule Triggers
Schedule triggers were omitted from this phase. The existing `workflow_triggers` table does not natively support `schedule` in its `CHECK` constraint. Because modifying the schema or overriding the Phase 2 database structure was explicitly prohibited unless necessary, schedule triggers are deferred as a future enhancement requiring a database migration.

## Webhook Endpoint Format

- **URL**: `https://{SUBDOMAIN}.functions.{REGION}.nhost.run/v1/webhook?triggerId={id}`
- **Method**: `POST` (The endpoint strictly validates that incoming requests use POST).
- **Authentication**: Requires the webhook secret. Can be provided in two ways:
  - Header: `x-webhook-secret: <secret>`
  - Header: `Authorization: Bearer <secret>`

## Authentication Mechanism & Secret Lifecycle

Webhooks must be protected against unauthorized execution, SSRF, and credential stuffing.

### 1. Creation
- Only users with the `owner` role can create a webhook trigger.
- When requested via `create-webhook.ts`, the backend generates a random cryptographically secure 32-byte secret (e.g., `whsec_...`).
- A random 16-byte salt is generated.
- The secret is hashed using `crypto.scryptSync(secret, salt, 64)`.
- The hash is stored in `workflow_triggers.secret_hash` as `${salt}:${hash}`.
- The plaintext secret is returned to the frontend **exactly once** and is displayed in a warning banner. It cannot be retrieved again.

### 2. Execution (Validation)
- The external service calls the `webhook.ts` endpoint with `triggerId` and the `secret`.
- The backend parses the provided secret and the stored `secret_hash`.
- A constant-time comparison (`crypto.timingSafeEqual`) is performed between the provided secret's scrypt hash and the stored scrypt hash to prevent timing attacks.
- If they match, the trigger is authenticated.

## Role Permissions (UX)

- **Owner**: Can create, enable/disable, and delete `webhook` triggers.
- **Editor**: Cannot create, edit, or delete `webhook` triggers.
- **Viewer**: Read-only access to the trigger list.

Note that this UX is enforced on the frontend. The backend `create-webhook.ts` endpoint strictly validates the JWT to enforce the `owner` role requirement dynamically, preventing unauthorized API calls.

## Security Protections

- **Shared Execution Engine**: Manual execution (`execute-workflow.ts`) and Webhook execution (`webhook.ts`) both invoke `_shared/runner.ts`. This guarantees that Phase 4 SSRF mitigations, local network access bans, execution timeouts, and execution logs apply universally.
- **Org Isolation**: The `webhook.ts` endpoint derives the `org_id` purely from the `workflow_triggers` relation (`trigger.workflow.org_id`). The incoming webhook payload is fundamentally untrusted and cannot override the organization ID or execution context.
- **Constant Time Comparisons**: Used to protect against timing side-channel attacks during secret validation.
- **Payload Size Limits**: The `webhook.ts` endpoint rejects payloads larger than 512KB (`413 Payload Too Large`) to prevent memory exhaustion / DoS attacks.
- **Secret Obfuscation**: The endpoint returns `401 Unauthorized` for disabled triggers, missing triggers, and invalid secrets indiscriminately, preventing attackers from probing the database for valid UUIDs.

## Test Results

Automated webhook tests (`test-triggers.mjs`) verify the API boundary of the serverless function. Live authenticated test behaviors for role checks and full execution are blocked by the Nhost environment email verification limitation, but local HTTP verification demonstrates the webhook correctly handles missing parameters, handles payload limits, checks for invalid secrets, and safely rejects unauthorized requests.
