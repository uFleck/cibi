// Fakes for the goals service tests: the Go mockGoalsRepo (internal/service/goals_test.go) and the
// Go newScopedAccountRepo helper (internal/service/transactions_test.go), as TS objects that
// implement the repo interfaces. A method that a test does not override behaves as the Go mock does.
// Go's `*sql.Tx` arguments are gone; the TxState checks record whether a call ran inside db.tx().

import { date } from '../dates'
import type { Account, AccountsRepo } from '../repo/accounts'
import type { Goal, GoalLedgerEntry, GoalRecurringContribution, GoalsRepo, UpdateGoal, UpdateGoalRecurringContribution } from '../repo/goals'
import type { TxState } from './fakes'

/** The nil uuid (Go uuid.Nil). */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Go's zero time.Time: 0001-01-01T00:00:00Z. */
export function zeroTime(): Date {
  return date(1, 1, 1)
}

/** Go's zero sqlite.Goal. */
export function zeroGoal(): Goal {
  return {
    id: NIL_UUID,
    accountId: NIL_UUID,
    name: '',
    status: '',
    targetAmountCents: 0,
    investedTotalCents: 0,
    minContributionPerWindowCents: 0,
    startDateUtc: zeroTime(),
    targetDateUtc: null,
    notes: null,
    currency: '',
    createdAtUtc: zeroTime(),
    updatedAtUtc: zeroTime(),
  }
}

/** Go's zero sqlite.GoalLedgerEntry. */
export function zeroLedgerEntry(): GoalLedgerEntry {
  return {
    id: NIL_UUID,
    goalId: NIL_UUID,
    amountCents: 0,
    type: '',
    source: '',
    note: null,
    reversesEntryId: null,
    timestampUtc: zeroTime(),
    createdAtUtc: zeroTime(),
  }
}

/** Go's zero sqlite.GoalRecurringContribution. */
export function zeroRecurring(): GoalRecurringContribution {
  return {
    id: NIL_UUID,
    goalId: NIL_UUID,
    amountCents: 0,
    frequency: '',
    anchorDateUtc: zeroTime(),
    nextDueUtc: zeroTime(),
    active: false,
    createdAtUtc: zeroTime(),
    updatedAtUtc: zeroTime(),
  }
}

/**
 * Go mockGoalsRepo: holds one goal, one ledger entry and one recurring row. Unset hooks behave as
 * the Go mock does. Methods are class methods so a test can subclass it (Go embeds the mock).
 */
export class MockGoalsRepo implements GoalsRepo {
  goal: Goal = zeroGoal()
  entry: GoalLedgerEntry = zeroLedgerEntry()
  recurring: GoalRecurringContribution = zeroRecurring()
  insertLedgerFn?: (e: GoalLedgerEntry) => Promise<void>
  updateGoalFn?: (id: string, upd: UpdateGoal) => Promise<void>
  getGoalsByAccountFn?: (accountId: string) => Promise<Goal[]>
  listLedgerByGoalFn?: (goalId: string) => Promise<GoalLedgerEntry[]>

  constructor(init: Partial<Pick<MockGoalsRepo, 'goal' | 'entry' | 'recurring'>> = {}) {
    Object.assign(this, init)
  }

  async insertGoal(g: Goal): Promise<void> {
    this.goal = g
  }

  async getGoalsByAccount(accountId: string): Promise<Goal[]> {
    if (this.getGoalsByAccountFn !== undefined) return this.getGoalsByAccountFn(accountId)
    return [this.goal]
  }

  async getGoalById(): Promise<Goal> {
    return this.goal
  }

  async updateGoal(id: string, upd: UpdateGoal): Promise<void> {
    if (this.updateGoalFn !== undefined) return this.updateGoalFn(id, upd)
    if (upd.investedTotalCents !== undefined) this.goal.investedTotalCents = upd.investedTotalCents
    if (upd.status !== undefined) this.goal.status = upd.status
    if (upd.targetAmountCents !== undefined) this.goal.targetAmountCents = upd.targetAmountCents
  }

  async insertLedgerEntry(e: GoalLedgerEntry): Promise<void> {
    this.entry = e
    if (this.insertLedgerFn !== undefined) await this.insertLedgerFn(e)
  }

  async listLedgerByGoal(goalId: string): Promise<GoalLedgerEntry[]> {
    if (this.listLedgerByGoalFn !== undefined) return this.listLedgerByGoalFn(goalId)
    return [this.entry]
  }

  async getLedgerEntryById(): Promise<GoalLedgerEntry> {
    return this.entry
  }

  async addTargetAudit(): Promise<void> {
    // The Go mock records nothing.
  }

  async insertRecurring(r: GoalRecurringContribution): Promise<void> {
    this.recurring = r
  }

  async listRecurringByAccount(): Promise<GoalRecurringContribution[]> {
    if (this.recurring.id === NIL_UUID) return []
    return [this.recurring]
  }

  async getRecurringById(): Promise<GoalRecurringContribution> {
    return this.recurring
  }

  async updateRecurring(_id: string, upd: UpdateGoalRecurringContribution): Promise<void> {
    if (upd.nextDueUtc !== undefined) this.recurring.nextDueUtc = upd.nextDueUtc
    if (upd.active !== undefined) this.recurring.active = upd.active
    if (upd.updatedAtUtc !== undefined) this.recurring.updatedAtUtc = upd.updatedAtUtc
  }
}

/**
 * Go newScopedAccountRepo: the account with the given id and starting balance. updateBalance must
 * be called for that id and, when txState is given, inside db.tx(). gotNewBalance records the value.
 */
export function scopedAccountRepo(
  expectedId: string,
  startingBalance: number,
  record: { newBalance?: number } = {},
  txState?: TxState,
): AccountsRepo {
  const account: Account = {
    id: expectedId,
    name: '',
    currentBalance: startingBalance,
    currency: 'BRL',
    safetyBuffer: 0,
    version: 1,
  }
  const unset = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    insert: unset,
    getAll: unset,
    getById: async (id: string) => {
      if (id !== expectedId) throw new Error(`unexpected account id: ${id}`)
      return { ...account }
    },
    updateBalance: async (id: string, balance: number) => {
      if (id !== expectedId) throw new Error(`unexpected account id on update: ${id}`)
      if (txState !== undefined && !txState.inTx) throw new Error('expected tx in UpdateBalance')
      record.newBalance = balance
    },
    updateName: unset,
    updateSafetyBuffer: unset,
    deleteById: unset,
    incrementVersion: unset,
  }
}
