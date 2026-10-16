// Fakes shared by the service and handler tests (the Go mocks of the Go test files, as TS objects
// that implement the repo interfaces). A method that a test does not override behaves as the Go mock
// does by default, not as "unset": the Go mocks return nil or sql.ErrNoRows when no *Fn is set.
// Go's `*sql.Tx` arguments are gone; trackingDb records whether a call ran inside db.tx(), which is
// the TS form of Go's "used tx" checks.

import type { Db } from '../db'
import { ErrNoRows } from '../errors'
import type { Account, AccountsRepo } from '../repo/accounts'
import type { LedgerEntry, LedgerRepo, NewLedgerEntry } from '../repo/ledger'
import type { Transaction, TransactionsRepo } from '../repo/transactions'
import { LedgerService } from '../service/ledger'

/** Go mockTransactionsRepo: unset methods insert nothing, return no rows, or sql.ErrNoRows for GetByID. */
export function fakeTransactionsRepo(overrides: Partial<TransactionsRepo> = {}): TransactionsRepo {
  return {
    insert: async () => undefined,
    getByAccount: async () => [],
    listUncategorized: async () => [],
    distinctCategories: async () => [],
    setCategoryIfBlank: async () => false,
    getById: async (): Promise<Transaction> => {
      throw ErrNoRows
    },
    update: async () => undefined,
    deleteById: async () => undefined,
    advanceNextOccurrence: async () => undefined,
    markConfirmed: async () => undefined,
    sumUpcomingObligations: async () => 0,
    incrementPaidInstallments: async () => undefined,
    ...overrides,
  }
}

/** Go mockAccountsRepo: unset methods do nothing, return no rows, or sql.ErrNoRows for the lookups. */
export function fakeAccountsRepo(overrides: Partial<AccountsRepo> = {}): AccountsRepo {
  return {
    insert: async () => undefined,
    getAll: async () => [],
    getById: async (): Promise<Account> => {
      throw ErrNoRows
    },
    updateBalance: async () => undefined,
    updateName: async () => undefined,
    updateSafetyBuffer: async () => undefined,
    deleteById: async () => undefined,
    incrementVersion: async () => undefined,
    ...overrides,
  }
}

/**
 * Go mockLedgerRepo: an in-memory ledger with the real behavior of each method. Entries are
 * kept in insertion order; Go's lookups return the first match.
 */
export function fakeLedgerRepo(seed: LedgerEntry[] = []): LedgerRepo {
  const entries: LedgerEntry[] = [...seed]
  return {
    insert: async (e: NewLedgerEntry) => {
      entries.push({ ...e, id: e.id ?? crypto.randomUUID() })
    },
    listByAccount: async (accountId: string) => entries.filter((e) => e.accountId === accountId).map((e) => ({ ...e })),
    deleteById: async (id: string) => {
      const i = entries.findIndex((e) => e.id === id)
      if (i !== -1) entries.splice(i, 1)
    },
    findByTransactionId: async (txnId: string) => {
      const found = entries.find((e) => e.transactionId === txnId)
      return found === undefined ? null : { ...found }
    },
    findById: async (id: string) => {
      const found = entries.find((e) => e.id === id)
      return found === undefined ? null : { ...found }
    },
    sumByAccount: async (accountId: string) =>
      entries.filter((e) => e.accountId === accountId).reduce((sum, e) => sum + e.amount, 0),
    updateAmount: async (id: string, amount: number) => {
      const found = entries.find((e) => e.id === id)
      if (found !== undefined) found.amount = amount
    },
  }
}

/**
 * Go newTestLedgerSvc: a LedgerService over the in-memory ledger. When accountId is set, an
 * opening_balance entry with seedBalance is seeded so SumByAccount starts from the account's state.
 */
export function newTestLedgerSvc(
  db: Db,
  accRepo: AccountsRepo,
  accountId: string | null,
  seedBalance: number,
): LedgerService {
  const seed: LedgerEntry[] =
    accountId === null
      ? []
      : [
          {
            id: crypto.randomUUID(),
            accountId,
            transactionId: null,
            payScheduleId: null,
            entryType: 'opening_balance',
            amount: seedBalance,
            description: '',
            postedAt: new Date(),
          },
        ]
  return new LedgerService(db, fakeLedgerRepo(seed), accRepo)
}

/** Records whether the work runs inside db.tx(): the TS form of Go's "used tx" checks. */
export interface TxState {
  inTx: boolean
}

/** A Db whose tx() sets state.inTx while its callback runs. Queries go to base unchanged. */
export function trackingDb(base: Db, state: TxState): Db {
  return {
    query: base.query,
    tx: <T>(fn: () => Promise<T>): Promise<T> =>
      base.tx(async () => {
        state.inTx = true
        try {
          return await fn()
        } finally {
          state.inTx = false
        }
      }),
  }
}
