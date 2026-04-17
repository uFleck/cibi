# Phase 10: Codebase Simplification and Logic Centralization — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 10-codebase-simplification-and-logic-centralization
**Areas discussed:** Repo consolidation scope, Frontend decomposition depth, Logic centralization targets, Bug fixes + test gap scope

---

## Repo Consolidation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Remove unscoped — account-scoped only | Single code path, pass *uuid.UUID, filter when non-nil | ✓ |
| Keep both paths | Less risky, duplication remains | |
| You decide | Claude picks based on callers | |

**User's choice:** Remove unscoped entirely

---

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic UPDATE — slice of (col, val) pairs | Single SQL statement, compact | ✓ |
| Dedicated patch struct | More type-safe, more boilerplate | |
| Leave as-is | Not worth risk | |

**User's choice:** Dynamic UPDATE

---

| Option | Description | Selected |
|--------|-------------|----------|
| Both — repo + service interfaces | Consistent cleanup | ✓ |
| Repo only | Safer, narrower | |
| You decide | Claude assesses callers | |

**User's choice:** Both repo and service interfaces

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add NOT NULL migration | Correctness fix for nullable account_id | ✓ |
| No — defer | Schema migrations carry risk | |
| You decide | Claude assesses data risk | |

**User's choice:** Add NOT NULL migration

---

## Frontend Decomposition Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full component extraction | FriendForm, DebtForm, GroupEventForm, ParticipantEditor into web/src/components/ | ✓ |
| Split by feature domain | Three files, still large | |
| You decide | Claude extracts based on cohesion | |

**User's choice:** Full component extraction

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — all three pages | friends.tsx, accounts.tsx, transactions.tsx | ✓ |
| friends.tsx only | Most egregious, others later | |
| You decide | Claude picks based on time/risk | |

**User's choice:** All three pages

---

## Logic Centralization Targets

| Option | Description | Selected |
|--------|-------------|----------|
| internal/engine/ | Pure date arithmetic, next to NextPayday/AddMonthClamped | ✓ |
| internal/service/ | Closer to callers | |
| You decide | Claude picks based on dependency graph | |

**User's choice:** internal/engine/

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — move to service layer | Testable without HTTP scaffolding | ✓ |
| No — leave in handler | Lower risk | |
| You decide | Claude assesses complexity | |

**User's choice:** Move public.go business logic to service layer

---

## Bug Fixes + Test Gap Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Fix both | DeleteTransaction + RecordDebit | ✓ |
| DeleteTransaction only | Skip dead code | |
| You decide | Claude picks by risk/impact | |

**User's choice:** Fix both

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — cover fixed/refactored methods only | Touched code only | |
| Yes — full service layer coverage push | Close the gap from CONCERNS.md | ✓ |
| No tests this phase | Simplification only | |

**User's choice:** Full service layer coverage push

---

## Claude's Discretion

- Exact component names/file layout for extracted frontend components
- Whether to use struct or variadic approach for dynamic UPDATE builder
- Order of operations in the service-layer test push
- Whether to include N+1 fix for GetFriendByToken alongside public.go refactor

## Deferred Ideas

- Per-account SafetyBuffer (schema change + new feature)
- Installment remainder cents fix
- Public token revocation endpoint
- Pagination on list endpoints
