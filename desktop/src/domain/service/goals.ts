// Port of internal/service/goals.go. The recurring and tracking methods (Go's goals_recurring.go and
// goals_tracking.go, methods of the same GoalsService) live in goalsRecurring.ts and goalsTracking.ts
// and are called from here.
//
// Money: the service works in integer cents. Inputs are dollars and go through toCents
// (goRound(dollars * 100), Go int64(math.Round(v * 100))).
// Times: a Go zero time for a timestamp means "now" (isZeroTime), as in Go.
// Transactions: Go's s.db.Begin() blocks are db.tx(); the ledger entry is recorded with the
// LedgerService inside that transaction (recordEntry with alreadyInTx).
// Ids: crypto.randomUUID() where Go uses uuid.New().
//
// Quirks kept from Go (see also the handlers):
// - UpdateGoal recomputes the status from the invested total on a target change, for any status
//   (an archived goal becomes active or completed).
// - AddLedgerEntry recomputes the status only as: completed when invested >= target, else active
//   only when it was completed. A withdrawal can make invested negative (no check).
// - Reversing an entry posts an "adjustment" with the opposite signed amount (negative for a reversed
//   contribution, so the invested total goes down; Go added instead, a bug fixed here). It moves no money
//   and does not link reverses_entry_id. Reversing the same entry twice is allowed. The goal id given is not checked against the entry's goal.

import type { Db } from '../db'
import { isZeroTime } from '../dates'
import { AppError, wrapping } from '../errors'
import { goRound } from '../num'
import type { AccountsRepo } from '../repo/accounts'
import type { Goal, GoalLedgerEntry, GoalsRepo, UpdateGoal } from '../repo/goals'
import type { LedgerService } from './ledger'
import { confirmRecurringDue, listRecurringDue, type GoalRecurringDueItem } from './goalsRecurring'
import { buildTracking, type GoalsTrackingResponse } from './goalsTracking'

/** Dollars to cents, as the Go service does it: int64(math.Round(v * 100)). */
export function toCents(dollars: number): number {
  return goRound(dollars * 100)
}

/** Go CreateGoalInput. Dates are UTC instants; the optional pointers are undefined or null (Go nil). */
export interface CreateGoalInput {
  accountId: string
  name: string
  targetAmount: number
  minContributionPerWindow: number
  startDateUtc: Date
  targetDateUtc?: Date | null
  notes?: string | null
}

/** Go UpdateGoalInput. A field left undefined is not changed (Go nil pointer). */
export interface UpdateGoalInput {
  name?: string
  targetAmount?: number
  targetDateUtc?: Date
  notes?: string
  minContributionPerWindow?: number
}

/** Go AddGoalLedgerInput. A timestamp left undefined (or the Go zero time) means now. */
export interface AddGoalLedgerInput {
  goalId: string
  amount: number
  type: string
  source: string
  timestampUtc?: Date
  note?: string | null
}

export class GoalsService {
  private readonly db: Db
  private readonly goals: GoalsRepo
  private readonly accRepo: AccountsRepo
  private readonly ledgerSvc: LedgerService

  constructor(db: Db, goals: GoalsRepo, accRepo: AccountsRepo, ledgerSvc: LedgerService) {
    this.db = db
    this.goals = goals
    this.accRepo = accRepo
    this.ledgerSvc = ledgerSvc
  }

  /** Creates an active goal in the account's currency. The target must be positive after rounding to cents. */
  async createGoal(input: CreateGoalInput): Promise<Goal> {
    const acc = await wrapping('goals.CreateGoal: get account', () => this.accRepo.getById(input.accountId))
    const now = new Date()
    const goal: Goal = {
      id: crypto.randomUUID(),
      accountId: input.accountId,
      name: input.name,
      status: 'active',
      targetAmountCents: toCents(input.targetAmount),
      investedTotalCents: 0,
      minContributionPerWindowCents: toCents(input.minContributionPerWindow),
      startDateUtc: input.startDateUtc,
      targetDateUtc: input.targetDateUtc ?? null,
      notes: input.notes ?? null,
      currency: acc.currency,
      createdAtUtc: now,
      updatedAtUtc: now,
    }
    if (goal.targetAmountCents <= 0) {
      throw new AppError('validation: target amount must be > 0')
    }
    await this.goals.insertGoal(goal)
    return goal
  }

  listGoals(accountId: string): Promise<Goal[]> {
    return this.goals.getGoalsByAccount(accountId)
  }

  /**
   * Updates the given fields. A target change also recomputes the status (completed when the invested
   * total reaches the new target, else active) and writes a GoalTargetAudit row, in one transaction.
   */
  async updateGoal(goalId: string, input: UpdateGoalInput): Promise<void> {
    const goal = await this.goals.getGoalById(goalId)
    const now = new Date()
    const upd: UpdateGoal = {
      name: input.name,
      targetDateUtc: input.targetDateUtc,
      notes: input.notes,
      updatedAtUtc: now,
    }
    if (input.minContributionPerWindow !== undefined) {
      const minContributionCents = toCents(input.minContributionPerWindow)
      if (minContributionCents < 0) {
        throw new AppError('validation: min contribution per window must be >= 0')
      }
      upd.minContributionPerWindowCents = minContributionCents
    }
    if (input.targetAmount !== undefined) {
      const newTarget = toCents(input.targetAmount)
      if (newTarget <= 0) {
        throw new AppError('validation: target amount must be > 0')
      }
      upd.targetAmountCents = newTarget
      upd.status = goal.investedTotalCents >= newTarget ? 'completed' : 'active'
      await this.db.tx(async () => {
        await this.goals.updateGoal(goalId, upd)
        await this.goals.addTargetAudit({
          id: crypto.randomUUID(),
          goalId,
          previousTargetAmountCents: goal.targetAmountCents,
          newTargetAmountCents: newTarget,
          changedAtUtc: now,
          note: null,
        })
      })
      return
    }
    await this.goals.updateGoal(goalId, upd)
  }

  /**
   * Records a contribution, withdrawal or adjustment of a goal and moves the money in the account
   * (contribution: the account pays; withdrawal: the account is credited; adjustment: no money).
   * One transaction: the goal entry, the ledger entry, and the goal's invested total and status.
   */
  async addLedgerEntry(input: AddGoalLedgerInput): Promise<GoalLedgerEntry> {
    const goal = await this.goals.getGoalById(input.goalId)
    const acc = await this.accRepo.getById(goal.accountId)
    const amountCents = toCents(input.amount)
    if (amountCents <= 0) {
      throw new AppError('validation: amount must be > 0')
    }
    const source = input.source === '' ? 'manual' : input.source
    const timestampUtc =
      input.timestampUtc === undefined || isZeroTime(input.timestampUtc) ? new Date() : input.timestampUtc

    let balanceDelta = 0
    let investDelta = 0
    switch (input.type) {
      case 'contribution':
        balanceDelta = -amountCents
        investDelta = amountCents
        if (acc.currentBalance < amountCents) {
          throw new AppError('insufficient funds')
        }
        break
      case 'withdrawal':
        balanceDelta = amountCents
        investDelta = -amountCents
        break
      case 'adjustment':
        investDelta = amountCents
        break
      default:
        throw new AppError('validation: invalid type')
    }

    return this.postEntry(goal, { amountCents, type: input.type, source, note: input.note ?? null, timestampUtc }, balanceDelta, investDelta)
  }

  /** Writes the goal entry, the account movement (when balanceDelta is not 0) and the goal's total and status. */
  private postEntry(
    goal: Goal,
    e: Pick<GoalLedgerEntry, 'amountCents' | 'type' | 'source' | 'note' | 'timestampUtc'>,
    balanceDelta: number,
    investDelta: number,
  ): Promise<GoalLedgerEntry> {
    return this.db.tx(async () => {
      const entry: GoalLedgerEntry = {
        id: crypto.randomUUID(),
        goalId: goal.id,
        amountCents: e.amountCents,
        type: e.type,
        source: e.source,
        note: e.note,
        reversesEntryId: null,
        timestampUtc: e.timestampUtc,
        createdAtUtc: new Date(),
      }
      await this.goals.insertLedgerEntry(entry)
      if (balanceDelta !== 0) {
        await this.ledgerSvc.recordEntry(
          {
            accountId: goal.accountId,
            transactionId: null,
            payScheduleId: null,
            entryType: 'manual_adjustment',
            amount: balanceDelta,
            description: `goal ${e.type}`,
            postedAt: e.timestampUtc,
          },
          true,
        )
      }
      const newInvested = goal.investedTotalCents + investDelta
      let status = goal.status
      if (newInvested >= goal.targetAmountCents) {
        status = 'completed'
      } else if (status === 'completed') {
        status = 'active'
      }
      await this.goals.updateGoal(goal.id, {
        investedTotalCents: newInvested,
        status,
        updatedAtUtc: new Date(),
      })
      return entry
    })
  }

  /**
   * Undoes the entry's effect on the invested total by posting an adjustment of the opposite signed
   * amount (a contribution or positive adjustment is subtracted, a withdrawal is given back).
   */
  async reverseLedgerEntry(goalId: string, entryId: string, note?: string | null): Promise<GoalLedgerEntry> {
    const orig = await this.goals.getLedgerEntryById(entryId)
    const goal = await this.goals.getGoalById(goalId)
    const origDelta = orig.type === 'withdrawal' ? -orig.amountCents : orig.amountCents
    return this.postEntry(
      goal,
      { amountCents: -origDelta, type: 'adjustment', source: 'system', note: note ?? null, timestampUtc: new Date() },
      0,
      -origDelta,
    )
  }

  listLedger(goalId: string): Promise<GoalLedgerEntry[]> {
    return this.goals.listLedgerByGoal(goalId)
  }

  buildTracking(accountId: string, now?: Date): Promise<GoalsTrackingResponse> {
    return buildTracking(this.goals, accountId, now)
  }

  listRecurringDue(accountId: string, now?: Date): Promise<GoalRecurringDueItem[]> {
    return listRecurringDue(this.goals, accountId, now)
  }

  confirmRecurringDue(itemId: string, timestamp?: Date): Promise<void> {
    return confirmRecurringDue(this.goals, (input) => this.addLedgerEntry(input), itemId, timestamp)
  }
}
