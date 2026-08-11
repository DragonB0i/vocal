# PHASE 13 LIVE VALIDATION REPORT

## 1. Authentication

**Status:** `BLOCKED_AUTH`
**Details:** The Nhost instance is hosted in the Cloud (`luttcgrgbhoixswtzfxv`). Nhost Auth requires email verification for new signups. Because we do not control the `gmail.com` mailboxes used for testing, and we do not have the real `HASURA_GRAPHQL_ADMIN_SECRET` to bypass the verification requirement at the database level, it is impossible to instantiate verified user sessions in this environment.

## 2. RBAC

**Status:** `BLOCKED_AUTH`
**Details:** Cannot create verified Editor/Viewer sessions to test GraphQL query/mutation rejections on live Hasura permissions. (Statically verified as structurally sound).

## 3. Tenant Isolation

**Status:** `BLOCKED_AUTH`
**Details:** Organization A vs Organization B cross-tenant data requests cannot be performed without verified sessions.

## 4. IDOR

**Status:** `BLOCKED_AUTH`
**Details:** All tested identifiers (Workflow, Run, Trigger, Step) cannot be spoofed across tenants because we cannot authenticate as the attacker.

## 5. Workflow Lifecycle

**Status:** `BLOCKED_AUTH`
**Details:** Draft / Active / Disabled execution boundaries cannot be triggered dynamically.

## 6. Webhooks

**Status:** `BLOCKED_AUTH`
**Details:** Secret validation, replay protection, and lifecycle cannot be tested without an authenticated Owner capable of generating the webhook trigger and extracting the plaintext secret.

## 7. Approval Gates

**Status:** `BLOCKED_AUTH`
**Details:** Race-condition result blocked.

## 8. Conditional Branches

**Status:** `BLOCKED_AUTH`
**Details:** True/false execution paths blocked.

## 9. DB Writes

**Status:** `BLOCKED_AUTH`
**Details:** Allowlist and isolation results blocked.

## 10. LLM

**Status:** `BLOCKED_EXTERNAL`
**Details:** Security and timeout results blocked because `OPENAI_API_KEY` is not provided in the environment.

## 11. SSRF

**Status:** `BLOCKED_AUTH`
**Details:** Dynamic attack results blocked. However, the static regex parsing and metadata filtering are verified in the `runner.ts` codebase.

## 12. Reliability

**Status:** `BLOCKED_AUTH`
**Details:** Retries, timeouts, idempotency, rate limiting.

## 13. Audit Logging

**Status:** `BLOCKED_AUTH`
**Details:** Event verification blocked.

## 14. Frontend

**Status:** `BLOCKED_AUTH`
**Details:** UX and direct API bypass testing blocked.

## 15. Regression

**Status:** `PASSED`
**Details:** Full Phase 1–12 test suite passed its static and structural verifications successfully. Code compiles, lints, and builds with zero vulnerabilities.
