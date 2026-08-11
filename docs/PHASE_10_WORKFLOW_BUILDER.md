# PHASE 10: WORKFLOW BUILDER

## Overview
Phase 10 substantially upgrades the internal workflow builder UI, transforming the rudimentary step-list into a functional visual editor. It enforces UI-level validation, inline step management, reordering, and previews, without modifying the immutable backend schema established in Phase 2.

## Features Implemented

### 1. Step Management
- **Add/Edit/Delete**: Complete CRUD functionality inside the builder for steps.
- **Reordering**: Users can click "Up" and "Down" arrows on steps. The backend updates the existing `position` integer natively using batched GraphQL mutations.
- **Visual Feedback**: Steps display dynamic summaries based on their configuration (e.g. `POST https://api.example.com` or `Requires human review`).

### 2. Client-Side Validation Layer
A structural `validateWorkflowConfig` heuristic was added to intercept configuration errors before sending data to the server or allowing execution:
- **`http_request`**: Verifies URL structure (`http://` or `https://`).
- **`conditional_branch`**: Verifies `field` and `operator` existence.
- **`llm_call`**: Ensures provider and non-empty prompt exist.
- **`db_write`**: Limits to `custom_app_data`, enforces operation selection, and performs JSON.parse() on payload strings.
- **`notify`**: Verifies non-empty message fields.
*Validation errors are rendered directly on the offending step card and block the Run button.*

### 3. Draft Editing Safety & Active Workflows
- Added a `Draft Editing Safety` notice that explicitly warns users if they are editing an `active` workflow, making it clear that live executions could be affected by their changes. We avoided implementing complex shadow versioning tables per schema constraints.

### 4. Trigger UX Improvements
- Manual trigger explicitly shown as the baseline default trigger.
- Webhook generation provides a highly visible yellow alert box strictly dictating that the secret must be copied immediately because the backend stores an irreversible hash.
- Webhook endpoint URLs are constructed dynamically and provided clearly to the user.

### 5. Execution Preview
- A modal preview was introduced (`Preview Execution`).
- Parses the sequential list of steps and warns the user about "Dangerous" operations (DB mutations, external HTTP requests) and identifies `approval_gate` pauses.

### 6. Enhanced Run UX
- `Run Workflow` provides instant feedback (`Initiating...`) and disables the button.
- Upon successful submission, it attempts to route the user instantly to the new run's visual details view at `/runs/[runId]`.

## Security Audit
- **Authorization**: The frontend inherently relies on the `isViewer`, `isEditor`, and `isOwner` values returned from context. Mutative buttons and configuration panels are physically stripped from the DOM for Viewers.
- **Secret Hygiene**: Webhook secrets are rendered strictly once from the Nhost function response and immediately purged on dismiss. `NHOST_ADMIN_SECRET` is not bundled into the React bundle.
- **Validation**: Client-side validation only supplements the rigid `runner.ts` and `execute-workflow.ts` backend constraints. Input cannot bypass Hasura permissions.

## Tests & QA
- `npm run lint` and `npm run build` confirm static integrity of Next.js / React components.
- `test-phase10.mjs` statically asserts that step mutations and previews exist, while ensuring admin secrets have not leaked. Authenticated user behavior validation is formally documented as BLOCKED due to local SMTP constraints preventing user invitation setup.

*Implementation complete and frozen for Phase 10.*
