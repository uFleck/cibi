// Port of internal/service/peer_debt.go.
//
// Ids are canonical UUID strings. Go's `*uuid.UUID` account filter is `null` for "every account" and the
// Unscoped/ByAccount variants of each method are kept as they are in Go. Money is integer cents.
// Go's slices are empty arrays here (a Go nil result is an empty array too).

import { formatDbTime, parseRfc3339OrYmd } from '../dates'
import { nextInstallmentDue } from '../engine/installment'
import { wrapping } from '../errors'
import type { ActiveUserDebt, GlobalPeerBalance, PeerDebt, PeerDebtBalance, PeerDebtRepo } from '../repo/peerDebt'

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

export class PeerDebtService {
  private readonly repo: PeerDebtRepo

  constructor(repo: PeerDebtRepo) {
    this.repo = repo
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

  /** Patches the amount and/or the description (undefined = no change). */
  updateDebt(id: string, amount?: number, description?: string): Promise<void> {
    return wrapping('service.UpdateDebt', () => this.repo.update(id, amount, description, undefined, undefined))
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

/**
 * Go buildFriendDebtItems. An installment debt with a positive total gets the next installment
 * date from the anchor date (or the debt date when there is no anchor); the date is null when it
 * does not parse. Any other debt is one payment, due on its date as stored (not parsed).
 */
function buildFriendDebtItems(rows: ActiveUserDebt[]): FriendDebtItem[] {
  return rows.map((r) => {
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
        const firstDue = parseRfc3339OrYmd(anchorStr)
        const nextDue = nextInstallmentDue(firstDue, r.paidInstallments, r.frequency)
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
