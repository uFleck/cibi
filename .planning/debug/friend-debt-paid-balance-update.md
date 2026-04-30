---
status: root_cause_found
slug: friend-debt-paid-balance-update
trigger: friend debts marked as paid aren't being accounted into account balance
created: 2026-04-17
updated: 2026-04-17
---

## Symptoms

- expected: when friend debt marked as paid, account balance updates (both directions — owed/owe)
- actual: balance does not change after marking debt as paid
- errors: none shown in UI or logs
- timeline: unknown — may never have worked
- reproduction: mark a friend debt as paid, check account balance

## Current Focus

- hypothesis: "GetBalanceByFriend SQL query sums ALL debts without filtering is_confirmed field"
- test: "balance query includes confirmed/paid debts"
- expecting: "confirmed debts should be excluded from balance calculation"
- next_action: apply fix — use compound is_installment-aware WHERE clause in GetBalanceByFriend and GetGlobalBalance
- reasoning_checkpoint: "UI sets is_confirmed=1 on confirm; balance query ignores this flag entirely. Installment debts use paid_installments < total_installments pattern not is_confirmed."
- tdd_checkpoint: ""

## Evidence

- timestamp: 2026-04-17T00:00:00Z
  source: friends.tsx:55
  note: UI shows 'Paid' badge when is_confirmed = true
- timestamp: 2026-04-17T00:00:00Z
  source: /peer-debts/:id/confirm route
  note: confirm endpoint sets is_confirmed = 1 in DB but debt row remains
- timestamp: 2026-04-17T00:00:00Z
  source: peer_debt.go:268-286
  note: GetBalanceByFriend has no active-debt filter — sums all debts including confirmed/paid ones
- timestamp: 2026-04-17T00:00:00Z
  source: peer_debt.go:329-405
  note: SumNextUserPayment and GetActiveUserDebtsWithFriend use compound filter (is_installment=1 AND paid_installments < total_installments) OR (is_installment=0 AND is_confirmed=0) — balance queries must match this pattern

## Eliminated

## Resolution

- root_cause: "GetBalanceByFriend and GetGlobalBalance SQL queries in peer_debt.go sum all peer debts with no active-debt filter. Confirmed non-installment debts (is_confirmed=1) and fully-paid installment debts (paid_installments >= total_installments) are both incorrectly included."
- fix: "Add compound WHERE filter to GetBalanceByFriend and GetGlobalBalance: (is_installment = 1 AND paid_installments < total_installments) OR (is_installment = 0 AND is_confirmed = 0) — matching the pattern already used by SumNextUserPayment and GetActiveUserDebtsWithFriend"
- verification: ""
- files_changed: ""

## Specialist Review

SUGGEST_CHANGE — fix direction is correct but incomplete. Simple `AND is_confirmed = 0` misses installment debts. Installment debts are paid when `paid_installments >= total_installments` (ConfirmInstallment increments this counter, does not set is_confirmed). Correct filter must be the compound pattern already used in peer_debt.go:329-405:
```sql
AND (
  (is_installment = 1 AND paid_installments < total_installments)
  OR
  (is_installment = 0 AND is_confirmed = 0)
)
```
