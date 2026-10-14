// Fakes for the peer debt and group event repos, used by the service tests (the Go mockPeerDebtRepo
// and mockGroupEventRepo of the Go service test files, as TS objects that implement the repo interfaces).
// Like fakes.ts, a method that a test does not override behaves as the Go mock does by default: it returns
// nothing, returns zero values, or returns sql.ErrNoRows for the lookups.

import { ErrNoRows } from '../errors'
import type { Friend, FriendRepo } from '../repo/friend'
import type { GroupEvent, GroupEventRepo } from '../repo/groupEvent'
import type { PeerDebt, PeerDebtRepo } from '../repo/peerDebt'

/** Go mockPeerDebtRepo: unset methods insert nothing, return no rows or zero values, or sql.ErrNoRows for GetByID. */
export function fakePeerDebtRepo(overrides: Partial<PeerDebtRepo> = {}): PeerDebtRepo {
  return {
    insert: async () => undefined,
    getByFriend: async () => [],
    getAll: async () => [],
    getById: async (): Promise<PeerDebt> => {
      throw ErrNoRows
    },
    update: async () => undefined,
    deleteById: async () => undefined,
    getBalanceByFriend: async () => ({ friendOwesUser: 0, userOwesFriend: 0, net: 0 }),
    getGlobalBalance: async () => ({ totalOwedToUser: 0, totalUserOwes: 0, net: 0 }),
    sumUpcomingPeerObligations: async () => 0,
    sumNextUserPayment: async () => 0,
    getActiveUserDebtsWithFriend: async () => [],
    confirmInstallment: async () => undefined,
    toggleInstallmentConfirmation: async () => undefined,
    ...overrides,
  }
}

/** Go mockGroupEventRepo: unset methods do nothing, return no rows or zero values, or sql.ErrNoRows for the lookups. */
export function fakeGroupEventRepo(overrides: Partial<GroupEventRepo> = {}): GroupEventRepo {
  return {
    insert: async () => undefined,
    getAll: async () => [],
    getById: async (): Promise<GroupEvent> => {
      throw ErrNoRows
    },
    getByToken: async (): Promise<GroupEvent> => {
      throw ErrNoRows
    },
    getByFriend: async () => [],
    update: async () => undefined,
    deleteById: async () => undefined,
    setParticipants: async () => undefined,
    setParticipantConfirmed: async () => undefined,
    toggleParticipantConfirmed: async () => undefined,
    getParticipants: async () => [],
    sumUpcomingAdminObligations: async () => 0,
    getAdminPendingExpenses: async () => [],
    getPendingBalanceForAdmin: async () => ({ theyOweAdmin: 0, adminOwesHost: 0 }),
    insertTransaction: async () => undefined,
    deleteTransactionById: async () => undefined,
    getTransactionsByEvent: async () => [],
    ...overrides,
  }
}

/** A FriendRepo that does nothing; the Go tests pass a nil friend repo where the service does not use it. */
export function fakeFriendRepo(overrides: Partial<FriendRepo> = {}): FriendRepo {
  return {
    insert: async () => undefined,
    getAll: async () => [],
    getById: async (): Promise<Friend> => {
      throw ErrNoRows
    },
    getByToken: async (): Promise<Friend> => {
      throw ErrNoRows
    },
    update: async () => undefined,
    deleteById: async () => undefined,
    ...overrides,
  }
}
