// Port of internal/service/group_event.go.
//
// Ids are canonical UUID strings. Go's `*uuid.UUID` account filter is `null` for "every account"; the
// Unscoped and ByAccount variants of each method are kept as Go has them. Money is integer cents.
// Go's friend repo is kept in the constructor (the Go signature), but no method uses it yet.

import { wrapping } from '../errors'
import type { FriendRepo } from '../repo/friend'
import type {
  AdminGroupExpense,
  GroupEvent,
  GroupEventBalance,
  GroupEventParticipant,
  GroupEventRepo,
  GroupEventTransaction,
} from '../repo/groupEvent'
import { generatePublicToken } from './token'

export class GroupEventService {
  private readonly repo: GroupEventRepo
  // Go's struct keeps friendRepo for participant friend validation; no method reads it yet.
  readonly friendRepo: FriendRepo

  constructor(repo: GroupEventRepo, friendRepo: FriendRepo) {
    this.repo = repo
    this.friendRepo = friendRepo
  }

  /** Every group event, optionally scoped by account (null = every account). */
  listEvents(accountId: string | null): Promise<GroupEvent[]> {
    return wrapping('service.ListEvents', () => this.repo.getAll(accountId))
  }

  listEventsUnscoped(): Promise<GroupEvent[]> {
    return wrapping('service.ListEventsUnscoped', () => this.repo.getAll(null))
  }

  listEventsByAccount(accountId: string): Promise<GroupEvent[]> {
    return wrapping('service.ListEventsByAccount', () => this.repo.getAll(accountId))
  }

  /** Creates an event with a new id and public token, and returns it. */
  async createEvent(
    accountId: string,
    title: string,
    date: string,
    totalAmount: number,
    notes: string | null,
  ): Promise<GroupEvent> {
    const e: GroupEvent = {
      id: crypto.randomUUID(),
      accountId,
      title,
      date,
      totalAmount,
      publicToken: generatePublicToken(),
      notes,
      hostFriendId: null,
    }
    await wrapping('service.CreateEvent', () => this.repo.insert(e))
    return e
  }

  getEventById(id: string): Promise<GroupEvent> {
    return wrapping('service.GetEventByID', () => this.repo.getById(id))
  }

  getEventByToken(token: string): Promise<GroupEvent> {
    return wrapping('service.GetEventByToken', () => this.repo.getByToken(token))
  }

  listEventsByFriend(friendId: string): Promise<GroupEvent[]> {
    return wrapping('service.ListEventsByFriend', () => this.repo.getByFriend(friendId))
  }

  /** Patches the given fields of an event (undefined = no change). */
  updateEvent(id: string, title?: string, date?: string, totalAmount?: number, notes?: string): Promise<void> {
    return wrapping('service.UpdateEvent', () => this.repo.update(id, title, date, totalAmount, notes))
  }

  /** Removes an event and its participants (cascade). */
  deleteEvent(id: string): Promise<void> {
    return wrapping('service.DeleteEvent', () => this.repo.deleteById(id))
  }

  setParticipants(eventId: string, participants: GroupEventParticipant[], hostFriendId: string | null): Promise<void> {
    return wrapping('service.SetParticipants', () => this.repo.setParticipants(eventId, participants, hostFriendId))
  }

  getParticipants(eventId: string): Promise<GroupEventParticipant[]> {
    return wrapping('service.GetParticipants', () => this.repo.getParticipants(eventId))
  }

  setParticipantConfirmed(eventId: string, friendId: string, isConfirmed: boolean): Promise<void> {
    return wrapping('service.SetParticipantConfirmed', () =>
      this.repo.setParticipantConfirmed(eventId, friendId, isConfirmed),
    )
  }

  toggleParticipantConfirmation(eventId: string, friendId: string): Promise<void> {
    return wrapping('service.ToggleParticipantConfirmation', () =>
      this.repo.toggleParticipantConfirmed(eventId, friendId),
    )
  }

  /** Pending admin-to-host obligations in [after, onOrBefore): negative or zero, for the engine math. */
  sumUpcomingAdminObligations(accountId: string | null, after: Date, onOrBefore: Date): Promise<number> {
    return wrapping('service.SumUpcomingAdminObligations', () =>
      this.repo.sumUpcomingAdminObligations(accountId, after, onOrBefore),
    )
  }

  sumUpcomingAdminObligationsUnscoped(after: Date, onOrBefore: Date): Promise<number> {
    return wrapping('service.SumUpcomingAdminObligationsUnscoped', () =>
      this.repo.sumUpcomingAdminObligations(null, after, onOrBefore),
    )
  }

  sumUpcomingAdminObligationsByAccount(accountId: string, after: Date, onOrBefore: Date): Promise<number> {
    return wrapping('service.SumUpcomingAdminObligationsByAccount', () =>
      this.repo.sumUpcomingAdminObligations(accountId, after, onOrBefore),
    )
  }

  getAdminPendingExpenses(accountId: string | null): Promise<AdminGroupExpense[]> {
    return wrapping('service.GetAdminPendingExpenses', () => this.repo.getAdminPendingExpenses(accountId))
  }

  getAdminPendingExpensesUnscoped(): Promise<AdminGroupExpense[]> {
    return wrapping('service.GetAdminPendingExpensesUnscoped', () => this.repo.getAdminPendingExpenses(null))
  }

  getAdminPendingExpensesByAccount(accountId: string): Promise<AdminGroupExpense[]> {
    return wrapping('service.GetAdminPendingExpensesByAccount', () => this.repo.getAdminPendingExpenses(accountId))
  }

  getPendingBalanceForAdmin(accountId: string | null): Promise<GroupEventBalance> {
    return wrapping('service.GetPendingBalanceForAdmin', () => this.repo.getPendingBalanceForAdmin(accountId))
  }

  getPendingBalanceForAdminUnscoped(): Promise<GroupEventBalance> {
    return wrapping('service.GetPendingBalanceForAdminUnscoped', () => this.repo.getPendingBalanceForAdmin(null))
  }

  getPendingBalanceForAdminByAccount(accountId: string): Promise<GroupEventBalance> {
    return wrapping('service.GetPendingBalanceForAdminByAccount', () =>
      this.repo.getPendingBalanceForAdmin(accountId),
    )
  }

  /** Creates a transaction for an event, stamped with the current time (UTC). */
  async addEventTransaction(eventId: string, description: string, amount: number): Promise<GroupEventTransaction> {
    const t: GroupEventTransaction = {
      id: crypto.randomUUID(),
      eventId,
      description,
      amount,
      createdAt: new Date(),
    }
    await wrapping('service.AddEventTransaction', () => this.repo.insertTransaction(t))
    return t
  }

  removeEventTransaction(id: string): Promise<void> {
    return wrapping('service.RemoveEventTransaction', () => this.repo.deleteTransactionById(id))
  }

  getEventTransactions(eventId: string): Promise<GroupEventTransaction[]> {
    return wrapping('service.GetEventTransactions', () => this.repo.getTransactionsByEvent(eventId))
  }

  /**
   * Splits totalAmount as evenly as possible across count participants; the remainder cents go to
   * the first one. 100 cents over 3 is [34, 33, 33]. A count of 0 or less gives no shares (Go nil).
   */
  equalSplitAmounts(totalAmount: number, count: number): number[] {
    if (count <= 0) return []
    // Go integer division truncates toward zero, and Go's % takes the sign of the dividend, as JS does.
    const base = Math.trunc(totalAmount / count)
    const remainder = totalAmount % count
    return [base + remainder, ...Array.from({ length: count - 1 }, () => base)]
  }
}
