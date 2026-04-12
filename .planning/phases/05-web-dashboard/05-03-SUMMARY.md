---
phase: 05-web-dashboard
plan: 03
status: complete
---

## Plan 05-03 Summary

**Objective**: Implement all three UI components and wire them into the Dashboard view.

### Tasks Completed

**Task 1: StatCards.tsx + ObligationsList.tsx**
- `StatCards.tsx`: 3-card responsive grid (1col mobile → 3col sm). Computes `reserved` from abs(txns with next_occurrence), `liquid = balance - reserved`. Liquid shows `var(--color-risk-blocked)` when ≤ 0
- `ObligationsList.tsx`: filters recurring txns with next_occurrence, sorts ascending by date, empty state with "No upcoming obligations." footer with "Total reserved:" and separator

**Task 2: CheckWidget.tsx — idle/loading/verdict state machine**
- 3-state machine: idle (input + CHECK button) → loading (disabled input + Loader2 spinner) → verdict (animated card + "Check another")
- Motion animation: `scale: 0.8→1.0`, `opacity: 0→1`, `backgroundColor` animates from vivid to tint oklch over 0.4s `easeOut`
- Import from `'motion/react'` (not framer-motion)
- `RISK_COLORS` map for badge backgrounds
- Error toast: "Something went wrong running the check. Try again."

**Task 3: Dashboard wiring — router.tsx + 2-query data flow**
- Query 1: `fetchDefaultAccount` — fires immediately
- Query 2: `fetchTransactions(account.id)` — gated on `enabled: !!account?.id`
- Error toast: "Could not load financial data. Retrying in 30 seconds." on any query error
- Skeleton loading placeholders while account loads
- Layout: `max-w-2xl mx-auto`, CIBI wordmark header, 3-section main (StatCards, CheckWidget, ObligationsList)

### Artifacts Created
- `web/src/components/StatCards.tsx`
- `web/src/components/CheckWidget.tsx`
- `web/src/components/ObligationsList.tsx`
- `web/src/router.tsx` (updated from stub to full Dashboard)

### Verification
- `cd web && npm run build` → success
- `cd web && npm run test -- --run` → 11 tests passed
- `go test ./...` → ok

### Deviations
- Renamed `router.ts` → `router.tsx` (contains JSX, requires .tsx extension)
