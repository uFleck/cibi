// Port of internal/service/peer_debt.go.
//
// Ids are canonical UUID strings. Go's `*uuid.UUID` account filter is `null` for "every account" and the
// Unscoped/ByAccount variants of each method are kept as they are in Go. Money is integer cents.
// Go's slices are empty arrays here (a Go nil result is an empty array too).

import { formatDbTime, parseRfc3339OrYmd } from '../dates'
import type { Db } from '../db'
import { nextInstallmentDue } from '../engine/installment'
import { AppError, ErrNoRows, wrap, wrapping } from '../errors'
import type { ActiveUserDebt, GlobalPeerBalance, PeerDebt, PeerDebtBalance, PeerDebtRepo } from '../repo/peerDebt'
import type { LedgerService } from './ledger'

/** Go FriendDebtItem: a computed summary of one active debt the user owes a friend (cents). */
export interface FriendDebtItem {
  friendName: string
  /** Absolute cents: the full debt. */
  totalAmount: number
  /** Absolute cents: the next installment, or the full lump sum. */
  nextPayment: number
  isInstallment: boolean
  /** Absolute cents; the same as nextPayment for installment debts. */
  perInstallAmount: number
  totalInstallments: number
  paidInstallments: number
  /** RFC3339 (UTC); null when the due date does not parse. */
  nextPaymentDate: string | null
}

/** A peer debt to create: the id is assigned by the service. */
export type NewPeerDebt = Omit<PeerDebt, 'id'>

/** Everything the edit form can change about a debt's plan. undefined = no change. */
export interface UpdatePeerDebtInput {
  amount?: number
  title?: string
  friendId?: string
  date?: string
  isInstallment?: boolean
  totalInstallments?: number | null
  frequency?: string | null
  anchorDate?: string | null
  nextOccurrence?: string | null
}

export class PeerDebtService {
  private readonly db: Db
  private readonly repo: PeerDebtRepo
  private readonly ledgerSvc: LedgerService

  constructor(db: Db, repo: PeerDebtRepo, ledgerSvc: LedgerService) {
    this.db = db
    this.repo = repo
    this.ledgerSvc = ledgerSvc
  }

  /** The debts of one friend, optionally scoped by account (null = every account). */
  listByFriend(friendId: string, accountId: string | null): Promise<PeerDebt[]> {
    return wrapping('service.ListByFriend', () => this.repo.getByFriend(friendId, accountId))
  }

  listByFriendUnscoped(friendId: string): Promise<PeerDebt[]> {
    return wrapping('service.ListByFriendUnscoped', () => this.repo.getByFriend(friendId, null))
  }

  listByFriendByAccount(friendId: string, accountId: string): Promise<PeerDebt[]> {
    return wrapping('service.ListByFriendByAccount', () => this.repo.getByFriend(friendId, accountId))
  }

  /** Every peer debt, optionally scoped by account (null = every account). */
  listAll(accountId: string | null): Promise<PeerDebt[]> {
    return wrapping('service.ListAll', () => this.repo.getAll(accountId))
  }

  listAllUnscoped(): Promise<PeerDebt[]> {
    return wrapping('service.ListAllUnscoped', () => this.repo.getAll(null))
  }

  listAllByAccount(accountId: string): Promise<PeerDebt[]> {
    return wrapping('service.ListAllByAccount', () => this.repo.getAll(accountId))
  }

  /** Creates a peer debt with a new id and returns it. */
  async createDebt(d: NewPeerDebt): Promise<PeerDebt> {
    const row: PeerDebt = { ...d, id: crypto.randomUUID() }
    await wrapping('service.CreateDebt', () => this.repo.insert(row))
    return row
  }

  getDebt(id: string): Promise<PeerDebt> {
    return wrapping('service.GetDebt', () => this.repo.getById(id))
  }

  /** Patches the plan and/or the money (undefined = no change). An unknown id is ErrNoRows, even with no fields. */
  updateDebt(id: string, patch: UpdatePeerDebtInput): Promise<void> {
    return wrapping('service.UpdateDebt', async () => {
      const hasPlanChange =
        patch.friendId !== undefined ||
        patch.date !== undefined ||
        patch.isInstallment !== undefined ||
        patch.totalInstallments !== undefined ||
        patch.frequency !== undefined ||
        patch.anchorDate !== undefined ||
        patch.nextOccurrence !== undefined
      // With nothing to change, the repo's no-fields error would hide an unknown id: look the id up first.
      if (patch.amount === undefined && patch.title === undefined && !hasPlanChange) {
        await this.repo.getById(id)
      }
      const details = hasPlanChange
        ? {
            friendId: patch.friendId,
            date: patch.date,
            isInstallment: patch.isInstallment,
            totalInstallments: patch.totalInstallments,
            frequency: patch.frequency,
            anchorDate: patch.anchorDate,
            nextOccurrence: patch.nextOccurrence,
          }
        : undefined
      await this.repo.update(id, patch.amount, patch.title, undefined, undefined, details)
    })
  }

  deleteDebt(id: string): Promise<void> {
    return wrapping('service.DeleteDebt', () => this.repo.deleteById(id))
  }

  /** Installment: paid + 1, capped at the total. Lump sum: confirmed. */
  confirmInstallment(id: string): Promise<void> {
    return wrapping('service.ConfirmInstallment', () => this.repo.confirmInstallment(id))
  }

  /** Flips the confirmation of a lump sum, or steps an installment up or back. */
  toggleInstallmentConfirmation(id: string): Promise<void> {
    return wrapping('service.ToggleInstallmentConfirmation', () => this.repo.toggleInstallmentConfirmation(id))
  }

  /**
   * Pays one debt: an installment pays one parcel, a lump sum pays all of it. The money moves in the
   * ledger, so the balance and the statement agree; a positive debt (the friend owes the user)
   * credits the account instead.
   */
  async settle(id: string): Promise<void> {
    const debt = await wrapping('service.SettleDebt: get', () => this.repo.getById(id))
    if (debt.isInstallment) {
      if (debt.totalInstallments === null || debt.paidInstallments >= debt.totalInstallments) {
        throw new AppError(`service.SettleDebt: debt ${id} has no installment left`)
      }
    } else if (debt.isConfirmed) {
      throw new AppError(`service.SettleDebt: debt ${id} is already paid`)
    }

    const totalInstallments = debt.totalInstallments ?? 1
    const absTotal = Math.abs(debt.amount)
    const perInstallment = debt.isInstallment
      ? Math.trunc(absTotal / totalInstallments)
      : absTotal
    // The last installment takes the remainder, so the debt ends exactly at zero.
    const isLastInstallment =
      debt.isInstallment && debt.paidInstallments === totalInstallments - 1
    const installmentAmount = isLastInstallment
      ? absTotal - perInstallment * (totalInstallments - 1)
      : perInstallment
    const amount = Math.sign(debt.amount) * installmentAmount
    if (amount === 0) throw new AppError(`service.SettleDebt: debt ${id} has no amount`)

    const occurrence = nextDebtDate(debt)

    await this.db.tx(async () => {
      await this.ledgerSvc.recordEntry(
        {
          accountId: debt.accountId,
          transactionId: debt.id,
          payScheduleId: null,
          entryType: 'payment',
          amount,
          description: debt.title,
          postedAt: new Date(),
          occurrenceDate: occurrence,
        },
        true,
      )
      await this.repo.confirmInstallment(id)
      if (debt.isInstallment) {
        if (debt.paidInstallments + 1 >= totalInstallments) {
          await this.repo.update(id, undefined, undefined, undefined, undefined, {
            nextOccurrence: null,
          })
        } else if (occurrence !== null) {
          await this.repo.update(id, undefined, undefined, undefined, undefined, {
            nextOccurrence: formatDbTime(
              nextInstallmentDue(occurrence, 1, debt.frequency ?? 'monthly'),
            ),
          })
        }
      }
    })
  }

  /** Undoes the latest settlement: the ledger is reversed and the debt steps back. */
  async unsettle(id: string): Promise<void> {
    const debt = await wrapping('service.UnsettleDebt: get', () => this.repo.getById(id))
    const entry = await wrapping('service.UnsettleDebt: find ledger', () =>
      this.ledgerSvc.findLatestByTransactionId(id),
    )
    // A debt paid before the ledger existed has no entry: step the counter back instead.
    const canStepBack =
      debt.paidInstallments > 0 || (!debt.isInstallment && debt.isConfirmed)
    if (entry === null && !canStepBack) throw wrap('service.UnsettleDebt', ErrNoRows)
    await this.db.tx(async () => {
      if (entry !== null) await this.ledgerSvc.reverseEntry(entry, true)
      await this.repo.unconfirm(id)
      if (debt.isInstallment) {
        const due = entry?.occurrenceDate ?? lastPaidDueDate(debt)
        await this.repo.update(id, undefined, undefined, undefined, undefined, {
          nextOccurrence: due === null ? null : formatDbTime(due),
        })
      }
    })
  }

  /** The balance of one friend across every account. */
  getBalanceByFriend(friendId: string): Promise<PeerDebtBalance> {
    return wrapping('service.GetBalanceByFriend', () => this.repo.getBalanceByFriend(friendId, null))
  }

  getGlobalBalance(accountId: string | null): Promise<GlobalPeerBalance> {
    return wrapping('service.GetGlobalBalance', () => this.repo.getGlobalBalance(accountId))
  }

  getGlobalBalanceUnscoped(): Promise<GlobalPeerBalance> {
    return wrapping('service.GetGlobalBalanceUnscoped', () => this.repo.getGlobalBalance(null))
  }

  getGlobalBalanceByAccount(accountId: string): Promise<GlobalPeerBalance> {
    return wrapping('service.GetGlobalBalanceByAccount', () => this.repo.getGlobalBalance(accountId))
  }

  /** Per-debt breakdown of the active debts the user owes friends, with the next payment and due date. */
  async getFriendDebtBreakdown(accountId: string | null): Promise<FriendDebtItem[]> {
    const rows = await wrapping('service.GetFriendDebtBreakdown', () =>
      this.repo.getActiveUserDebtsWithFriend(accountId),
    )
    return buildFriendDebtItems(rows)
  }

  async getFriendDebtBreakdownUnscoped(): Promise<FriendDebtItem[]> {
    const rows = await wrapping('service.GetFriendDebtBreakdownUnscoped', () =>
      this.repo.getActiveUserDebtsWithFriend(null),
    )
    return buildFriendDebtItems(rows)
  }

  async getFriendDebtBreakdownByAccount(accountId: string): Promise<FriendDebtItem[]> {
    const rows = await wrapping('service.GetFriendDebtBreakdownByAccount', () =>
      this.repo.getActiveUserDebtsWithFriend(accountId),
    )
    return buildFriendDebtItems(rows)
  }

  /** The next payment of every active debt: one installment, or the full amount of a lump sum. */
  sumNextUserPayment(accountId: string | null): Promise<number> {
    return wrapping('service.SumNextUserPayment', () => this.repo.sumNextUserPayment(accountId))
  }

  sumNextUserPaymentUnscoped(): Promise<number> {
    return wrapping('service.SumNextUserPaymentUnscoped', () => this.repo.sumNextUserPayment(null))
  }

  sumNextUserPaymentByAccount(accountId: string): Promise<number> {
    return wrapping('service.SumNextUserPaymentByAccount', () => this.repo.sumNextUserPayment(accountId))
  }
}

/** The due date of the payment `settle` is about to make; null when the stored date does not parse. */
function nextDebtDate(debt: PeerDebt): Date | null {
  try {
    if (!debt.isInstallment) return parseRfc3339OrYmd(debt.date)
    if (debt.nextOccurrence !== null && debt.nextOccurrence !== '') {
      return parseRfc3339OrYmd(debt.nextOccurrence)
    }
    const first = parseRfc3339OrYmd(debt.anchorDate ?? debt.date)
    return nextInstallmentDue(first, debt.paidInstallments, debt.frequency ?? 'monthly')
  } catch {
    return null
  }
}

/** The date of the installment `unsettle` is taking back, for a debt paid before the ledger existed. */
function lastPaidDueDate(debt: PeerDebt): Date | null {
  try {
    const first = parseRfc3339OrYmd(debt.anchorDate ?? debt.date)
    return nextInstallmentDue(
      first,
      Math.max(debt.paidInstallments - 1, 0),
      debt.frequency ?? 'monthly',
    )
  } catch {
    return null
  }
}

/**
 * Go buildFriendDebtItems. An installment debt with a positive total gets the next installment
 * date from the anchor date (or the debt date when there is no anchor); the date is null when it
 * does not parse. Any other debt is one payment, due on its date as stored (not parsed).
 */
function buildFriendDebtItems(rows: ActiveUserDebt[]): FriendDebtItem[] {  return rows.map((r) => {
    const totalAbs = -r.amount
    const item: FriendDebtItem = {
      friendName: r.friendName,
      totalAmount: totalAbs,
      nextPayment: 0,
      isInstallment: r.isInstallment,
      perInstallAmount: 0,
      totalInstallments: r.totalInstallments,
      paidInstallments: r.paidInstallments,
      nextPaymentDate: null,
    }
    if (r.isInstallment && r.totalInstallments > 0) {
      // Go integer division truncates toward zero.
      const perInst = Math.trunc(totalAbs / r.totalInstallments)
      item.nextPayment = perInst
      item.perInstallAmount = perInst
      const anchorStr = r.anchorDate !== null && r.anchorDate !== '' ? r.anchorDate : r.date
      try {
        const nextDue =
          r.nextOccurrence !== null && r.nextOccurrence !== ''
            ? parseRfc3339OrYmd(r.nextOccurrence)
            : nextInstallmentDue(
                parseRfc3339OrYmd(anchorStr),
                r.paidInstallments,
                r.frequency,
              )
        item.nextPaymentDate = formatDbTime(nextDue)
      } catch {
        // Unparseable anchor: no next date (Go leaves NextPaymentDate nil).
      }
    } else {
      item.nextPayment = totalAbs
      item.perInstallAmount = totalAbs
      item.nextPaymentDate = r.date
    }
    return item
  })
}
