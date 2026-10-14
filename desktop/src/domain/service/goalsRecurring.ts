// Port of internal/service/goals_recurring.go. GoalsService.listRecurringDue and confirmRecurringDue
// delegate here. Go's methods take the service's repo and LedgerService; here the repo is passed in,
// and confirm gets the service's addLedgerEntry as a callback (the Go AddLedgerEntry call).
//
// Money: an item's amount is dollars (cents / 100). Times: formatDbTime (RFC3339, UTC, whole seconds).
// A Go zero time passed as `now` or `timestamp` means "now", as Go's IsZero check does.
// Quirks kept from Go:
// - confirm posts ONE period: next_due advances once, so a contribution that is several periods
//   overdue stays due after a confirm.
// - an unknown frequency does not advance next_due (advanceFrequency returns the base time).
// - confirm is not one transaction: the ledger entry is posted (its own tx), then next_due is updated.
// - list does not post anything; is_overdue is next_due strictly before now, while a row due exactly
//   at now is listed with is_overdue false.

import { addDays, addMonths, formatDbTime, isZeroTime } from '../dates'
import { AppError } from '../errors'
import type { GoalRecurringContribution, GoalLedgerEntry, GoalsRepo } from '../repo/goals'
import type { AddGoalLedgerInput } from './goals'

/** Go GoalRecurringDueItem. Amount is dollars; the lastEntry fields are null when no recurring entry exists. */
export interface GoalRecurringDueItem {
  id: string
  goalId: string
  goalName: string
  amount: number
  frequency: string
  anchorDateUtc: string
  nextDueUtc: string
  isOverdue: boolean
  lastEntryId: string | null
  lastPostedAtUtc: string | null
}

/** Lists the active recurring rows of an account that are due at `now` (Go ListRecurringDue). */
export async function listRecurringDue(goals: GoalsRepo, accountId: string, now?: Date): Promise<GoalRecurringDueItem[]> {
  const at = now === undefined || isZeroTime(now) ? new Date() : now
  const items = await goals.listRecurringByAccount(accountId)
  const out: GoalRecurringDueItem[] = []
  for (const item of items) {
    if (!item.active || item.nextDueUtc.getTime() > at.getTime()) continue
    const goal = await goals.getGoalById(item.goalId)
    const entries = await goals.listLedgerByGoal(item.goalId)
    // The last recurring entry in the (timestamp ascending) list, found from the end.
    const last = lastRecurringEntry(entries)
    out.push({
      id: item.id,
      goalId: item.goalId,
      goalName: goal.name,
      amount: item.amountCents / 100,
      frequency: item.frequency,
      anchorDateUtc: formatDbTime(item.anchorDateUtc),
      nextDueUtc: formatDbTime(item.nextDueUtc),
      isOverdue: item.nextDueUtc.getTime() < at.getTime(),
      lastEntryId: last === undefined ? null : last.id,
      lastPostedAtUtc: last === undefined ? null : formatDbTime(last.timestampUtc),
    })
  }
  return out
}

function lastRecurringEntry(entries: GoalLedgerEntry[]): GoalLedgerEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e !== undefined && e.source === 'recurring') return e
  }
  return undefined
}

/**
 * Posts one contribution for a due recurring row and moves its next_due one period ahead (Go
 * ConfirmRecurringDue). postContribution is the service's AddLedgerEntry.
 */
export async function confirmRecurringDue(
  goals: GoalsRepo,
  postContribution: (input: AddGoalLedgerInput) => Promise<GoalLedgerEntry>,
  itemId: string,
  timestamp?: Date,
): Promise<void> {
  const item: GoalRecurringContribution = await goals.getRecurringById(itemId)
  if (!item.active) {
    throw new AppError('recurring contribution is inactive')
  }
  const at = timestamp === undefined || isZeroTime(timestamp) ? new Date() : timestamp
  if (at.getTime() < item.nextDueUtc.getTime()) {
    throw new AppError('recurring contribution is not due yet')
  }
  await postContribution({
    goalId: item.goalId,
    amount: item.amountCents / 100,
    type: 'contribution',
    source: 'recurring',
    timestampUtc: at,
    note: null,
  })
  const next = advanceFrequency(item.nextDueUtc, item.frequency)
  await goals.updateRecurring(item.id, { nextDueUtc: next, updatedAtUtc: new Date() })
}

/** Go advanceFrequency: one period ahead; an unknown frequency gives the base time. */
export function advanceFrequency(base: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly':
      return addDays(base, 7)
    case 'bi-weekly':
      return addDays(base, 14)
    case 'monthly':
      return addMonths(base, 1)
    case 'yearly':
      return addMonths(base, 12)
    default:
      return new Date(base.getTime())
  }
}
