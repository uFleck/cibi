# Phase 7: N Payment Schedules per Account — Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Each account can have N pay schedules (e.g., "3k on day 10, 2k on day 20" on the same checking account). Each schedule carries an expected income `amount`. The CanIBuyIt engine projects purchasing power using per-schedule obligation windows and returns a new WAIT verdict when the user can't afford now but could after the next payday.

UI: Settings page in the web dashboard for managing pay schedules per account.

**NOT in scope:** Multi-month projections, notification/alerts, budget categories.

</domain>

<decisions>
## Implementation Decisions

### D-01: N Schedules Per Account (Schema Change)
One account can have N pay schedules. The current 1-to-1 model (PaySchedule.account_id as effective unique key) must be broken:
- `PaySchedule` table: remove any unique constraint on `account_id`
- `GetByAccountID` → replaced by `ListByAccountID` returning `[]PaySchedule`
- `SetPaySchedule` upsert pattern replaced by explicit Create / Update / Delete
- Each `PaySchedule` row gets its own `id` (already exists as UUID PK)

### D-02: Amount Field on PaySchedule
Each pay schedule stores the expected income amount in **cents** (INTEGER, same as all money columns):
- New column: `amount INTEGER NOT NULL DEFAULT 0` on `PaySchedule`
- `PaySchedule` Go struct gains `Amount int64` field
- Exposed in API request/response as `amount` (integer cents)

### D-03: Engine — Per-Schedule Obligation Windows, Summed
`CanIBuyIt` loads ALL schedules for the account. For each schedule:
1. Compute `next_payday_i = engine.NextPayday(schedule_i, now)`
2. Sum obligations where `next_occurrence > now AND next_occurrence <= next_payday_i`

Total upcoming obligations = sum across all schedule windows. This means an obligation due before the earliest payday will be counted in EVERY schedule's window — agents must decide how to deduplicate (e.g., union the window instead of summing per-schedule, or use distinct obligation IDs). **Flag this as a design decision for the researcher/planner to resolve with the union approach.**

Purchasing power formula unchanged: `balance - total_obligations - safety_buffer`.

### D-04: WAIT Verdict (New EngineResult State)
When `CanBuy = false`, the engine checks one step ahead:
- Find the schedule with the nearest next_payday (`min(next_payday_i)`)
- Projected balance after that pay: `balance + schedule_i.amount`
- Projected obligations from now through that next_payday (same window as D-03 for that schedule)
- If `projected_balance - projected_obligations - safety_buffer >= itemPrice` → WAIT verdict

`EngineResult` gains two new fields:
- `WillAffordAfterPayday bool` — true if WAIT verdict applies
- `WaitUntil *time.Time` — the payday date that makes it affordable (nil when CanBuy=true or WillAffordAfterPayday=false)

`RiskLevel` for WAIT verdict: use string `"WAIT"` (new tier).

Look-ahead depth: **next payday only** (no multi-payday projection).

### D-05: API — Full CRUD for Pay Schedules
Replace the current `POST /api/pay-schedule` (upsert) with:
- `GET  /api/pay-schedule?account_id=:id` — list all schedules for account
- `POST /api/pay-schedule` — create a new schedule (body includes account_id, frequency, anchor_date, amount, day_of_month, day_of_month_2, label)
- `PATCH /api/pay-schedule/:id` — update a schedule by its own UUID
- `DELETE /api/pay-schedule/:id` — delete a schedule by its own UUID

### D-06: Web UI — Settings Page
Pay schedule management lives in `web/src/pages/settings.tsx` (stub already exists).

Settings page layout:
- Account selector at top (reuse the `AccountSelector` component being built in Phase 5)
- Per-account section showing list of pay schedules (each as a card/row)
- "Add schedule" button → inline form or modal
- Each row: edit (PATCH) + delete (DELETE) actions
- Fields: frequency, anchor date, amount, label, day_of_month (monthly), day_of_month_2 (semi-monthly)

### D-07: Web UI — WAIT Verdict on Dashboard
The "Can I Buy It?" verdict card (built in Phase 5) gains a WAIT state:
- Amber/yellow color (distinct from green YES and red NO)
- Text: "Not yet — you'll have enough after [date]"
- Shows the WaitUntil date formatted as "Apr 10"
- Motion animation: same scale + opacity enter as YES/NO

### D-08: Frequency Enum Alignment
The handler currently validates `oneof=weekly biweekly monthly`. The engine uses `bi-weekly` and `semi-monthly`. Align to engine constants:
- Valid values: `weekly`, `bi-weekly`, `semi-monthly`, `monthly` (drop `yearly` unless already in schema)
- Update handler validate tag and any existing migration/DDL comments

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `internal/repo/sqlite/pay_schedule.go` — current PayScheduleRepo interface + SqlitePayScheduleRepo implementation
- `internal/service/pay_schedule.go` — current PayScheduleService (upsert pattern)
- `internal/service/engine.go` — CanIBuyIt formula and EngineResult struct
- `internal/engine/engine.go` — NextPayday, AddMonthClamped, frequency constants
- `internal/handler/pay_schedule.go` — current handler (upsert endpoint, validate tags)
- `internal/handler/routes.go` — route registration (replace POST-only pay-schedule group)
- `internal/migrations/` — SQL migrations (new migration needed for `amount` column + constraint removal)
- `web/src/pages/settings.tsx` — Settings page stub (where pay schedule UI goes)
- `web/src/components/AccountSelector.tsx` — reuse for account context in Settings page
- `.planning/REQUIREMENTS.md` — SCHEMA-03 (PaySchedule entity definition)

</canonical_refs>

<deferred>
## Deferred Ideas

- Multi-month income projection ("in 3 months I'll have X") — own phase
- Budget envelopes tied to pay schedules — own phase
- Notification/alert when a payday passes without a matching transaction — own phase
- `yearly` frequency support — straightforward add-on, not blocking Phase 7

</deferred>
