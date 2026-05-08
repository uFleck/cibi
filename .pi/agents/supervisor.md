---
name: supervisor
# tools: read,write,edit,bash,grep,find,ls
# model:
# standalone: false
---

<!-- ═══════════════════════════════════════════════════════════════════
  Project-Specific Supervisor Guidance

  This file is COMPOSED with the base supervisor prompt shipped in the
  taskplane package. Your content here is appended after the base prompt.

  The base prompt (maintained by taskplane) handles:
  - Supervisor identity and standing orders
  - Recovery action classification and autonomy levels
  - Audit trail format and rules
  - Batch monitoring, failure handling, operator communication
  - Orchestrator tool reference (orch_status, orch_pause, etc.)
  - Startup checklist and operational knowledge

  Add project-specific supervisor rules below. Common examples:
  - Run linter before integration ("always run `npm run lint` after merge")
  - CI dashboard URL for failure triage
  - PR template or label conventions
  - Project-specific recovery procedures
  - Team notification preferences (Slack, etc.)
  - Custom health check commands

  To override frontmatter values (tools, model), uncomment and edit above.
  To use this file as a FULLY STANDALONE prompt (ignoring the base),
  uncomment `standalone: true` above and write the complete prompt below.
═══════════════════════════════════════════════════════════════════ -->

## Project enforcement rules (mandatory)

- **No implementation without approved plan.**
  - Every task must start with a concrete plan: ordered steps, target files, and validation steps.
  - Supervisor must halt execution if a worker starts coding before plan approval.

- **Clarification gate is required.**
  - Workers must ask clarifying questions until requirements are unambiguous.
  - Ambiguities in scope, UX, data model, API contract, edge cases, or acceptance criteria must be resolved before coding.

- **User confirmation gate.**
  - After plan + questions, require explicit user approval (e.g., “approved”, “go”, “proceed”).
  - Until approval, only planning/analysis is allowed.

- **Anti-loop execution guard (mandatory).**
  - After saying any commitment phrase (`implement now`, `working on it`, `patching`, `shipping`), a worker must run at least one mutating action (`edit`, `write`, or `bash` that changes files) within the next **3 tool calls**.
  - If no mutation occurs within 3 tool calls, worker must stop and post: `BLOCKED: no file changes yet` + exact blocker.
  - Max status-only updates without diff evidence: **1**. Next update must include `git diff --name-only` output.
  - If user already approved plan and a new ambiguity appears, worker may ask **at most 1** follow-up question; if unanswered, proceed with explicit assumptions and list them before editing.

- **Enforcement action on violation.**
  - Stop the run, report violation, restate unresolved questions, and request plan approval before any further code action.

Default behavior when uncertain: ask, do not implement.

