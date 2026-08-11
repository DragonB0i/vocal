# Phase 6: Advanced Workflow Steps

This document outlines the advanced workflow engine capabilities implemented in Phase 6, along with configuration formats, role constraints, and security behaviors.

## Overview

The execution engine (`_shared/runner.ts`) has been significantly refactored to support:
- **Context Propagation:** Steps can now reference outputs from previous steps using `interpolateConfig`.
- **Sequential Pause/Resume:** Workflows can dynamically pause and be safely resumed without risking skipped steps or duplicate execution.
- **Structural Integrity:** Because the Phase 2 schema (`workflow_runs` and `step_runs` status column constraints) strictly limits valid states to `pending`, `running`, `paused`, `completed`, `failed`, `cancelled`, we have safely mapped conceptual states (`waiting` -> `paused`, `skipped` -> `cancelled`) to guarantee schema compliance without needing migrations.

---

## 1. Context Propagation

Context is aggregated per-run into a structured JSON object containing step outputs.

You can interpolate variables in strings using `{{ }}` syntax:
`"message": "Step output is {{ steps.MyStepName.output.field }}"`

**Security Limit:** Interpolation uses strict structural paths (e.g. Lodash-style `get()`). Arbitrary JavaScript execution, `eval`, `Function()`, and template literal evaluation are completely prohibited and technically impossible within the runner constraints.

---

## 2. Supported Step Types

### 2.1 Conditional Branch (`conditional_branch`)
Evaluates a safe, deterministic condition. If it fails, the step completes successfully with `matched: false`, but **halts downstream execution** by marking subsequent steps as `cancelled` (equivalent to skipped). The overall workflow run completes successfully without a failure flag.

**Configuration:**
```json
{
  "condition": {
    "field": "steps.FetchData.output.status",
    "operator": "equals",
    "value": "success"
  }
}
```
**Supported Operators:** `equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `exists`.

### 2.2 Approval Gate (`approval_gate`)
Pauses execution until an authorized user approves it.
- When the runner encounters an unapproved `approval_gate`, it marks the step and the workflow run as `paused`.
- Execution halts securely.
- An authorized user calls `functions/approve-step.ts`. The backend verifies the user belongs to the workflow's organization and is an `owner` or `editor`.
- After approval, the runner is re-invoked in "resume mode", skipping completed steps and continuing securely.

### 2.3 LLM Call (`llm_call`)
Executes an LLM completion request.
- **Provider:** Groq (via `https://api.groq.com/v1/chat/completions`).
- **Authentication:** Must be provided via `GROQ_API_KEY` on the backend environment. If missing, it fails safely rather than faking success. Keys are NEVER exposed to the frontend or workflow config.
- **Security:** Strict 10,000 character prompt limits and forced token limits prevent resource abuse.

**Configuration:**
```json
{
  "provider": "groq",
  "model": "gpt-3.5-turbo",
  "prompt": "Summarize this: {{ steps.Fetch.output.body }}",
  "temperature": 0.2
}
```

### 2.4 DB Write (`db_write`)
Allows limited structural mutation of the database.
- **Allowed Table:** strictly limited to `custom_app_data`.
- **Allowed Operations:** `insert`, `update`. `delete` is prohibited.
- **Security:** Raw SQL is outright banned. The operation uses parameterized GraphQL mutations specifically bound to the workflow's authenticated `org_id`. It is impossible for a workflow to write to `organizations`, `workflows`, `users`, or any other tenant's `custom_app_data`.

**Configuration:**
```json
{
  "table": "custom_app_data",
  "operation": "insert",
  "data": { "key": "value" }
}
```

---

## 3. Role Restrictions

Phase 2 role constraints natively persist. The UI safely disables elements for Viewer/Editor where applicable, but the backend strictly enforces permissions.

- **Viewer:** Cannot create or modify workflows. Cannot run workflows.
- **Editor:** Can create standard steps. **Cannot** create `db_write` or `notify` steps. Can approve `approval_gate`.
- **Owner:** Full access.

---

## 4. Known Limitations
- **Schedule Triggers:** The `workflow_triggers` schema constraint allows only `manual` and `webhook`. Scheduled triggers are deferred pending a future migration.
- **Idempotency Locks:** While the resume logic checks `completed` states to prevent duplicate step execution on resumption, high-throughput concurrent webhook hits may race. Full distributed locking is limited by the current database schema.
