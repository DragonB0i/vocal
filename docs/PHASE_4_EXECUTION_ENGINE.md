# Phase 4: Workflow Execution Engine

## Architecture

The workflow execution engine is implemented as an Nhost Serverless Function (`functions/execute-workflow.ts`). This function receives a `POST` request containing a `workflowId`, authenticates the caller via their JWT, validates permissions using the Nhost Admin Secret against the Hasura GraphQL API, and then sequentially executes the ordered workflow steps. 

## Request Flow
1. **Frontend Trigger**: A user clicks "Run Workflow". The client SDK (`nhost.functions.call`) handles sending the request to `/v1/execute-workflow` with the JWT in the `Authorization` header.
2. **Backend Authentication**: The function extracts the JWT and passes it directly to Hasura to query the `workflows` table. If the workflow returns `null`, the user does not have permission, and execution is aborted (403 Forbidden).
3. **Backend Authorization**: The function reads the user's ID from the token claims and checks their exact role in the returned `org_members` list. Execution is halted if they are not an `owner` or `editor`.
4. **Initialization**: An Admin-privileged mutation creates a new `workflow_run` (Status: `running`) and an `audit_log`.
5. **Execution**: The backend iteratively runs each step ordered by `position`.
6. **Completion**: The final status is written to the `workflow_run` and another `audit_log` is captured.

## Supported Step Types

- **`http_request`**: Performs an outbound `fetch`.
- **`notify`**: Inserts a notification record to the database alerting the organization.

*All other steps (`llm_call`, `db_write`, `conditional_branch`, `approval_gate`) are strictly marked as unsupported and instantly fail the step to prevent arbitrary code execution vulnerabilities.*

## SSRF Protections

The `http_request` step implements Server-Side Request Forgery (SSRF) protections before executing a request:
- Validates the URL scheme (only `http:` and `https:` are permitted, blocking `file:`, `ftp:`, etc.)
- Rejects common local hostnames (`localhost`, `127.0.0.1`, `0.0.0.0`, `169.254.x.x`).
- Rejects common private IP address formats (e.g., `10.x.x.x`, `192.168.x.x`).
- Enforces an `AbortController` timeout of 10 seconds to prevent hanging requests.
- Truncates responses at 5000 characters to prevent Memory Exhaustion or Denial of Service attacks.

## Execution Lifecycle & Failure Handling

If a step throws an error or returns a non-2xx status code:
1. The error details are written to the `error` column in `step_runs`.
2. The `step_run` status becomes `failed`.
3. The sequential execution loop `breaks`, preventing subsequent steps from running.
4. The `workflow_run` is marked as `failed` instead of `completed`.

## Security Boundaries
- Normal users are never given explicit permission to `insert` or `update` the `workflow_runs` and `step_runs` tables. Hasura RLS blocks client mutations. 
- The Nhost Admin Secret (`NHOST_ADMIN_SECRET`) remains server-only. It is never exposed in browser bundles or `NEXT_PUBLIC_*` variables.
- The execution function trusts *nothing* from the client body except the target `workflowId`. The user identity is cryptographically derived from the JWT payload, guaranteeing cross-tenant isolation.

## Testing & Known Limitations

**Automated Tests:**
- Tested Unauthenticated Execution: Successfully rejected (401).
- Authenticated Tests: Blocked by Nhost email verification (as documented in Phase 2). The `test-execution.mjs` script actively attempts authentication but gracefully outputs the blocked status rather than fabricating passing tests.

**Limitations:**
- Strict Idempotency: Duplicate simultaneous requests may create duplicate `workflow_runs`. While this correctly represents two manual execution requests, there is no lock to prevent concurrent runs of the *same* workflow.
- Email Verification: We are unable to natively test backend execution using our local scripts due to the hardcoded email requirement in Nhost Cloud.
