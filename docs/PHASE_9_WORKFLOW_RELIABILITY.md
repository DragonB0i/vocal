# PHASE 9: WORKFLOW RELIABILITY & SCHEDULING

## Overview
Phase 9 hardens workflow execution by formalizing the execution lifecycle, enhancing trigger safety, creating isolated execution visibility, and formalizing architecture decisions about scheduling.

## Features Implemented

### 1. Workflow Lifecycle Management
Workflows natively default to `draft` per the Phase 2 schema. In this phase, we implemented explicit state transitions between `active` and `disabled`.
* **Frontend Toggle**: Owners and editors can now disable a workflow from its detail page.
* **Execution Rejection**: Attempting to execute a disabled workflow via the UI run button or a webhook endpoint now natively returns `403 Forbidden` early in the execution chain.

### 2. Execution Run History
A completely isolated timeline view was created for tracking executions down to the millisecond.
* **Run Details (`/runs/[id]`)**: Visualizes chronologically exactly which steps ran.
* **Granular Observability**: Surfaces execution duration, attempt count (retries), exact error stacks, and the JSON outputs from each step for debugging purposes.
* **Approval Gates UI**: When an execution is paused for an `approval_gate`, authorized users can explicitly "Approve & Resume" the execution directly from the run details view.

### 3. Workflow Version Safety
The `runWorkflowEngine` (in `_shared/runner.ts`) pulls down a snapshot of the configured workflow steps immediately upon invocation. Subsequent step execution operates entirely on this in-memory graph.
* **Benefit**: Users can freely mutate the underlying workflow definition in the UI without randomly breaking a currently executing background run (except when resuming an execution from a paused state, at which point the *latest* step configuration downstream is intentionally evaluated).

### 4. Trigger Reliability
* **Webhook Hardening**: Triggers enforce both their own enabled flag (`workflow_triggers.enabled = true`) and the parent workflow's status (`workflow.status = active`).
* **Existing Defenses Maintained**: Webhook secrets are hashed dynamically and constant-time compared. SSRF protections against internal IP ranges are explicitly untouched.

## Architecture Limitations & Scheduling

### Scheduling Capability (REJECTED)
**Decision**: Scheduling capabilities (cron/delayed execution) were explicitly excluded from this implementation.
**Reason**: The immutable Phase 2 database schema explicitly constrains trigger types via a CHECK constraint:
`type TEXT NOT NULL CHECK (type IN ('manual', 'webhook'))`.
As per the directives to respect the frozen schema, adding a `schedule` trigger type would require a database migration altering the constraint, which is expressly forbidden. We have documented this limitation and left it for a future schema update.

## Security Model Verification
1. **Viewer Restrictions**: The viewer role remains functionally read-only. `isViewer` dynamically disables the "Run Workflow" and "Active/Disabled" UI toggles, and server-side roles reject mutations.
2. **Organization Isolation**: The `/runs/[id]` GraphQL fetch dynamically enforces `workflow: {org_id: {_eq: $orgId}}`.
3. **Admin Credential Escrow**: The `NHOST_ADMIN_SECRET` remains completely contained in the serverless functions.
4. **Trigger Secret Handling**: Displayed precisely once upon generation and never returned or decrypted again.

## Tests
* `test-phase9.mjs` was created.
* Static layout analysis successfully validates the presence and constraints of the `execute-workflow.ts`, `webhook.ts`, and `runs/[id]/page.tsx` structural integrations.
* As with prior phases, live execution of disabled triggers, run timelines, and permission tests are explicitly marked `BLOCKED (AUTH VERIFICATION)` because of Nhost's local instance requiring live SMTP verification.

## Limitations
* Because execution steps are pulled in memory, extremely massive workflows (e.g., thousands of steps) could hit serverless function memory boundaries.
* Notifications are decoupled from detailed execution logs.

*Implementation complete and frozen for Phase 9.*
