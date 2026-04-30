---
phase: 14-goals-tracking-tab-dashboard-widget-recurring-investments-and-purchase-impact
verified: 2026-04-29T19:47:30Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "Recurring goal contributions support due/overdue visibility and manual confirm/post flow with source badges (manual/system/recurring)."
    status: partial
    reason: "Backend/API flow exists, but Goals UI does not consume recurring due/confirm endpoints, so complete recurring UX is not delivered."
    artifacts:
      - path: web/src/pages/goals.tsx
        issue: "No query/mutation using listGoalRecurring/confirmGoalRecurring; no due/overdue list or confirm controls rendered."
      - path: web/src/lib/api.ts
        issue: "Recurring client functions exist but are orphaned (exported, not used by goals surface)."
    missing:
      - "Render recurring due/overdue section in Goals tab"
      - "Wire manual confirm action to POST /api/goals/recurring/{id}/confirm"
      - "Show recurring source/executed cues in recurring workflow UI"
---

# Phase 14: Goals tracking tab/dashboard/recurring/impact Verification Report

**Phase Goal:** Deliver complete goals-tracking UX and supporting APIs: Goals tab, dashboard snapshot widget, recurring investment due/confirm flow, and purchase-impact preview across check and goals surfaces.
**Verified:** 2026-04-29T19:47:30Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Goals tab shows summary cards, urgency-sorted goals list, and recent activity with empty/loading/error/retry states. | ✓ VERIFIED | `web/src/pages/goals.tsx` has summary cards, goals list, activity blocks, skeletons, retry button, updated cue. Query key `['goals','tracking',accountId]`. |
| 2 | Dashboard widget shows top 3-5 urgent goals with progress %, remaining amount, and quick actions. | ✓ VERIFIED | `web/src/components/GoalsSnapshotWidget.tsx` slices `top_goals` to 5, renders progress/remaining, has `Add contribution` + `Open Goals` actions, mounted in `web/src/router.tsx`. |
| 3 | Recurring goal contributions support due/overdue visibility and manual confirm/post flow with source badges (manual/system/recurring). | ✗ FAILED (partial) | Backend complete (`internal/service/goals_recurring.go`, `/api/goals/recurring` routes + OpenAPI), but frontend goals surface does not call `listGoalRecurring`/`confirmGoalRecurring` and renders no recurring due/confirm UI. |
| 4 | Purchase-check flow shows pre-confirm per-goal impact preview with severity tiers (LOW/MEDIUM/HIGH). | ✓ VERIFIED | `/check` maps `goal_impacts` in `internal/handler/check.go`; `CheckWidget` renders “Goal impact preview” + severity badge + before/after + progress deltas. |
| 5 | UI refresh/invalidation shows visible updated cues after goal/ledger mutations. | ✓ VERIFIED | `goals.tsx` invalidates tracking query after create/add contribution; shows `Updated {time}` from `updated_at_utc`; error retry + toast present. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `internal/service/goals_tracking.go` | tracking DTO + urgency sort | ✓ VERIFIED | Exists, substantive, deterministic `sort.SliceStable`, top-5 cap, recent activity aggregation. |
| `internal/handler/goals_tracking.go` | GET `/api/goals/tracking` | ✓ VERIFIED | Exists, validates UUID, returns JSON payload. |
| `internal/service/goals_recurring.go` | due/overdue + confirm-post | ✓ VERIFIED | Exists; list is read-only, confirm posts ledger source=`recurring`, advances one period. |
| `internal/handler/goals_recurring.go` | recurring list + confirm endpoints | ✓ VERIFIED | Exists and wired in routes. |
| `web/src/pages/goals.tsx` | complete goals tracking UX incl recurring flow | ⚠️ HOLLOW | Core tracking UX exists; recurring due/confirm UX missing. |
| `web/src/components/GoalsSnapshotWidget.tsx` | dashboard snapshot widget | ✓ VERIFIED | Exists, wired, data-driven from tracking query. |
| `web/src/components/CheckWidget.tsx` | goal impact preview in check flow | ✓ VERIFIED | Exists, wired to `postCheck` result and renders impact list. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `internal/handler/routes.go` | `internal/handler/goals_tracking.go` | `goals.GET("/tracking", ...)` | ✓ WIRED | Route registration present. |
| `internal/handler/goals_tracking.go` | `internal/service/goals_tracking.go` | `BuildTracking` call | ✓ WIRED | Handler calls service directly. |
| `internal/handler/routes.go` | recurring handlers | `/goals/recurring` + `/recurring/:id/confirm` | ✓ WIRED | Routes present. |
| `web/src/pages/goals.tsx` | `/api/goals/tracking` | query hook | ✓ WIRED | `fetchGoalsTracking(accountId)` used in React Query. |
| `web/src/pages/goals.tsx` | recurring API client funcs | list/confirm recurring | ✗ NOT_WIRED | No calls to `listGoalRecurring` or `confirmGoalRecurring`. |
| `web/src/components/CheckWidget.tsx` | `web/src/lib/api.ts` | `postCheck` + `goal_impacts` render | ✓ WIRED | End-to-end type+render path present. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `web/src/pages/goals.tsx` | `trackingQuery.data` | `fetchGoalsTracking` -> `/api/goals/tracking` -> `GoalsService.BuildTracking` -> `GoalsRepo.GetGoalsByAccount` + `ListLedgerByGoal` SQL | Yes (DB queries in `internal/repo/sqlite/goals.go`) | ✓ FLOWING |
| `web/src/components/GoalsSnapshotWidget.tsx` | `trackingQuery.data.top_goals` | Same tracking chain as above | Yes | ✓ FLOWING |
| `web/src/components/CheckWidget.tsx` | `result.goal_impacts` | `postCheck` -> `/api/check` -> `EngineService.CanIBuyIt` `buildGoalImpacts` + goals repo query | Yes | ✓ FLOWING |
| `web/src/pages/goals.tsx` (recurring) | N/A | N/A | No source connected | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend tracking/recurring/check tests | `go test ./internal/service ./internal/handler -run "GoalsTracking|Urgency|Recurring|Check|Impact|WAIT|Tracking"` | `ok` service + handler | ✓ PASS |
| Frontend goals/check widget tests | `cd web && npm test -- --run goals CheckWidget goals-widget` | 4 files, 8 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| P14-01 | 14-01, 14-03 | Goals tab summary + dense list + activity | ✓ SATISFIED | `goals.tsx` sections + tracking endpoint + tests pass. |
| P14-02 | 14-01, 14-03 | Dashboard multi-goal widget + urgency + quick actions | ✓ SATISFIED | `GoalsSnapshotWidget.tsx` + mounted in router; top-goals rendering. |
| P14-03 | 14-02, 14-03 | Recurring due/overdue + manual confirm flow + source badges | ✗ BLOCKED (UX gap) | API/service implemented; goals UI not wired to recurring list/confirm. |
| P14-04 | 14-04 | Purchase impact preview per goal | ✓ SATISFIED | `/check` contract includes `goal_impacts`; `CheckWidget` renders preview. |
| P14-05 | 14-01..14-04 | Loading/error/refresh states across surfaces | ✓ SATISFIED | Skeleton/retry/toast/updated cue in goals; error/retry in widget; tests pass. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `web/src/pages/goals.tsx` | - | Missing recurring API usage | 🛑 Blocker | Prevents completion of recurring UX must-have. |
| `web/src/components/GoalsSnapshotWidget.tsx` | - | No dedicated component test file present | ⚠️ Warning | Lower confidence in widget behavior regressions. |

### Human Verification Required

None beyond gap closure. Automated evidence already found concrete missing wiring.

### Gaps Summary

Phase 14 is close, but not complete. Tracking tab, dashboard widget, and purchase-impact preview are implemented and wired. Recurring due/confirm backend is implemented, but recurring flow is not exposed in goals UI, so the phase goal (“complete goals-tracking UX”) is not fully achieved.

---

_Verified: 2026-04-29T19:47:30Z_
_Verifier: Claude (gsd-verifier)_
