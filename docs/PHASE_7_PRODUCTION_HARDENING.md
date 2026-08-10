# Phase 7: Production Hardening, Reliability & Observability

## Goal
Transform the Phase 6 workflow execution engine into a robust, production-ready system capable of handling transient failures, malicious requests, concurrency races, and unbounded execution.

## Security Audit & Fixes Applied
- **Vulnerability**: Endpoints were locally decoding JWT payloads to determine the authenticated user, relying implicitly on Hasura rejecting invalid signatures. While structurally safe due to the preceding Hasura query, this violated the principle of not trusting unverified payloads locally.
  - **Fix**: Replaced local JWT payload parsing with `getAuthenticatedUserId`, which securely queries `auth.users` through Hasura using the provided token. This guarantees the user's identity is verified by the source of truth.
- **Vulnerability**: Duplicate approval requests for the same paused step could race and resume the workflow twice.
  - **Fix**: Updated `approve-step.ts` to use a conditional atomic update (`update_step_runs(where: {id: {_eq: $id}, status: {_eq: "paused"}})`).
- **Vulnerability**: Missing idempotency allowed duplicate webhook deliveries or double-clicked manual executions to spawn duplicate concurrent workflow runs.
  - **Fix**: Implemented in-memory `Idempotency-Key` tracking for manual runs and `x-webhook-delivery-id` tracking (with payload-hash fallback) for webhooks.

## Reliability Mechanisms
- **Execution Timeouts**: The `runner.ts` engine now enforces a strict 60,000ms (60s) overall execution timeout.
- **Abort Controllers**: Replaced unbounded HTTP and LLM `fetch` requests with `AbortController` limits (10s and 15s respectively) to prevent hanging execution.
- **Rate Limiting**: Added a lightweight, in-memory Map-based rate limiter to the edge functions (`execute-workflow`, `webhook`, `create-webhook`, `approve-step`) to prevent request flooding.

## Retry System
- **Exponential Backoff**: Steps can now configure `max_retries`. The runner catches transient errors (`AbortError`, `fetch failed`, HTTP 5xx) and retries the step with an exponential backoff (`delay = 2^attempt * 1000` ms).
- **Hard Boundaries**: Security validation errors, missing parameters, DB writes, and unsupported step failures are strictly **not** retried.

## Observability & UX
- Modified the frontend UI to display per-step and overall workflow execution durations.
- Surfaced `retry_count` in the execution history UI.
- Improved error sanitation so generic errors are returned via webhooks, while localized detailed execution errors are formatted cleanly in the frontend UI without exposing backend context.
- Disabled "Run" and "Approve" buttons while execution requests are pending.

## Known Limitations
- **Distributed Rate Limiting**: The in-memory idempotency and rate limit implementations are scoped to the current serverless instance lifetime. While this is sufficient for preventing typical accidental double-clicks and basic request flooding, a true distributed system (like Redis) or database schema modification would be required for absolute strict global enforcement across multiple instances. However, per the architectural constraint, we have prioritized freezing the schema.
- **Authenticated Tests**: Automated testing of authenticated flows remains manually blocked until the Nhost email verification setup provides verified test user accounts.

## Testing
`test-phase7.mjs` was created to validate unauthenticated execution, malformed JWTs, missing parameters, webhook idempotency structure, and rate limiting limits.
