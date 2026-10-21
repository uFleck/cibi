// @vitest-environment node
// Ports of internal/service/transactions_test.go (19 tests). The Go mocks are fakes from testing/fakes.ts;
// the LedgerService is the real one, over the in-memory ledger (as in Go). The Go "used tx" checks
// become checks that the call ran inside db.tx() (trackingDb). The Go mockAccountsRepo fixtures
// (newScopedAccountRepo) are scopedAccountRepo below.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ErrNoRows, isErr } from '../errors'
import { FREQ_MONTHLY, FREQ_WEEKLY } from '../engine/engine'
import type { Account, AccountsRepo } from '../repo/accounts'
import type { Transaction, UpdateTransaction } from '../repo/transactions'
import { createTestDb } from '../testing/testDb'
import {
  fakeAccountsRepo,
  fakeTransactionsRepo,
  newTestLedgerSvc,
  trackingDb,
  type TxState,
} from '../testing/fakes'
import { TransactionsService, type NewTransaction } from './transactions'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

/** A stored transaction with Go's zero values, overridden by `over`. */
function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: '',
    accountId: '',
    type: '',
    friendId: null,
    amount: 0,
    title: '',
    description: null,
    links: [],
    category: null,
    timestamp: new Date(0),
    isRecurring: false,
    frequency: null,
    anchorDate: null,
    nextOccurrence: null,
    requiresConfirmation: false,
    confirmedAt: null,
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    estimateSource: null,
    estimateKey: null,
    isUncertain: false,
    isAsNeeded: false,
    ...over,
  }
}

/** A transaction to create with Go's zero values: no id and no timestamp (Go uuid.Nil and zero time). */
function newTxn(over: Partial<NewTransaction> = {}): NewTransaction {
  return {
    accountId: '',
    type: '',
    friendId: null,
    amount: 0,
    title: '',
    description: null,
    links: [],
    isRecurring: false,
    frequency: null,
    anchorDate: null,
    nextOccurrence: null,
    requiresConfirmation: false,
    confirmedAt: null,
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    estimateSource: null,
    estimateKey: null,
    isUncertain: false,
    isAsNeeded: false,
    ...over,
  }
}

function account(id: string, balance: number): Account {
  return {
    id,
    name: '',
    currentBalance: balance,
    currency: 'BRL',
    safetyBuffer: 0,
    version: 1,
  }
}

/** What the scoped account repo saw: the last balance written and whether that write ran in a tx. */
interface Recorded {
  newBalance: number
  updated: boolean
  updatedInTx: boolean
}

/** Go newScopedAccountRepo: the account is expectedId with startingBalance; UpdateBalance records the balance. */
function scopedAccountRepo(state: TxState, expectedId: string, startingBalance: number, rec: Recorded): AccountsRepo {
  return fakeAccountsRepo({
    getById: async (id: string): Promise<Account> => {
      expect(id).toBe(expectedId)
      return account(expectedId, startingBalance)
    },
    updateBalance: async (id: string, balance: number) => {
      expect(id).toBe(expectedId)
      rec.updated = true
      rec.updatedInTx = state.inTx
      rec.newBalance = balance
    },
  })
}

function freshRecorded(): Recorded {
  return { newBalance: 0, updated: false, updatedInTx: false }
}

// TestCreateTransaction_UpdatesBalanceAtomically: the insert and the balance update both run in a tx;
// 10000 - 2500 = 7500.
it('TestCreateTransaction_UpdatesBalanceAtomically', async () => {
  const accountId = crypto.randomUUID()
  const startingBalance = 10000
  const txnAmount = -2500

  const state: TxState = { inTx: false }
  let insertUsedTx = false
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    insert: async (t: Transaction) => {
      insertUsedTx = state.inTx
      expect(t.amount).toBe(txnAmount)
    },
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.createTransaction(newTxn({ accountId, amount: txnAmount }))

  expect(insertUsedTx && rec.updatedInTx).toBe(true)
  expect(rec.newBalance).toBe(7500)
})

// TestCreateTransaction_FutureAnchorDate_DoesNotUpdateBalance: a recurring transaction whose anchor is
// in the future is inserted but does not touch the balance.
it('TestCreateTransaction_FutureAnchorDate_DoesNotUpdateBalance', async () => {
  const accountId = crypto.randomUUID()
  const txnAmount = -2500
  const futureAnchor = new Date(Date.now() + 24 * 60 * 60 * 1000)

  const state: TxState = { inTx: false }
  let insertUsedTx = false
  let updateBalanceCalled = false

  const txnsRepo = fakeTransactionsRepo({
    insert: async (t: Transaction) => {
      insertUsedTx = state.inTx
      expect(t.amount).toBe(txnAmount)
      expect(t.anchorDate).not.toBeNull()
      expect(t.anchorDate?.getTime()).toBe(futureAnchor.getTime())
    },
  })
  const accRepo = fakeAccountsRepo({
    getById: async (): Promise<Account> => account(accountId, 10000),
    updateBalance: async () => {
      updateBalanceCalled = true
    },
  })

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, null, 0)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.createTransaction(
    newTxn({
      accountId,
      amount: txnAmount,
      anchorDate: futureAnchor,
      isRecurring: true,
      frequency: FREQ_MONTHLY,
      timestamp: new Date(),
    }),
  )

  expect(insertUsedTx).toBe(true)
  expect(updateBalanceCalled).toBe(false)
})

// TestCreateTransaction_PendingPayment_DoesNotUpdateBalance: an unconfirmed pending payment is inserted
// without reading the account or changing the balance.
it('TestCreateTransaction_PendingPayment_DoesNotUpdateBalance', async () => {
  const accountId = crypto.randomUUID()
  const txnAmount = -2500

  const state: TxState = { inTx: false }
  let insertUsedTx = false
  let accountReadCalled = false
  let updateBalanceCalled = false

  const txnsRepo = fakeTransactionsRepo({
    insert: async (t: Transaction) => {
      insertUsedTx = state.inTx
      expect(t.requiresConfirmation).toBe(true)
    },
  })
  const accRepo = fakeAccountsRepo({
    getById: async (): Promise<Account> => {
      accountReadCalled = true
      return account(accountId, 10000)
    },
    updateBalance: async () => {
      updateBalanceCalled = true
    },
  })

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, null, 0)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.createTransaction(
    newTxn({
      accountId,
      amount: txnAmount,
      requiresConfirmation: true,
      timestamp: new Date(),
    }),
  )

  expect(insertUsedTx).toBe(true)
  expect(accountReadCalled).toBe(false)
  expect(updateBalanceCalled).toBe(false)
})

// TestUpdateTransaction_RecalculatesBalanceWhenAmountChanges: an applied transaction whose amount changes
// records a manual adjustment of the delta (-5000 - -2000 = -3000): 10000 - 3000 = 7000.
it('TestUpdateTransaction_RecalculatesBalanceWhenAmountChanges', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const oldAmount = -2000
  const newAmount = -5000
  const startingBalance = 10000

  const state: TxState = { inTx: false }
  let updateUsedTx = false
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (id: string): Promise<Transaction> => {
      expect(id).toBe(txnId)
      return txn({ id: txnId, accountId, amount: oldAmount })
    },
    update: async (id: string, upd: UpdateTransaction) => {
      expect(id).toBe(txnId)
      expect(upd.amount).toBe(newAmount)
      updateUsedTx = state.inTx
    },
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.updateTransaction(txnId, { amount: newAmount })

  expect(updateUsedTx).toBe(true)
  expect(rec.newBalance).toBe(7000)
})

// TestUpdateTransaction_PendingPaymentAmount_DoesNotAdjustBalanceBeforeConfirmation: an unconfirmed pending
// payment changes amount without touching the balance, and without a tx.
it('TestUpdateTransaction_PendingPaymentAmount_DoesNotAdjustBalanceBeforeConfirmation', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const oldAmount = -2000
  const newAmount = -5000

  const state: TxState = { inTx: false }
  let updateUsedTx = false
  let updateBalanceCalled = false

  const txnsRepo = fakeTransactionsRepo({
    getById: async (id: string): Promise<Transaction> => {
      expect(id).toBe(txnId)
      return txn({ id: txnId, accountId, amount: oldAmount, requiresConfirmation: true })
    },
    update: async (id: string, upd: UpdateTransaction) => {
      expect(id).toBe(txnId)
      expect(upd.amount).toBe(newAmount)
      updateUsedTx = state.inTx
    },
  })
  const accRepo = fakeAccountsRepo({
    getById: async (): Promise<Account> => {
      throw new Error('unexpected account read')
    },
    updateBalance: async () => {
      updateBalanceCalled = true
    },
  })

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, null, 0)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.updateTransaction(txnId, { amount: newAmount })

  expect(updateUsedTx).toBe(false) // expected non-atomic update (no balance impact yet)
  expect(updateBalanceCalled).toBe(false)
})

// TestUpdateTransaction_InstallmentWithPaidInstallments_UsesCorrectBalanceDelta: with 3 installments paid,
// a per-installment change from -5000 to -6000 moves the balance by 3 * -1000 = -3000: 100000 -> 97000.
it('TestUpdateTransaction_InstallmentWithPaidInstallments_UsesCorrectBalanceDelta', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const oldAmount = -5000
  const newAmount = -6000
  const paidInstallments = 3
  const total = 12
  const startingBalance = 100000 // after 3 installments of 5000 already applied

  const state: TxState = { inTx: false }
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        accountId,
        amount: oldAmount,
        isInstallment: true,
        totalInstallments: total,
        paidInstallments,
      }),
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.updateTransaction(txnId, { amount: newAmount })

  // Expected: 100000 - (3 * -5000) + (3 * -6000) = 100000 + 15000 - 18000 = 97000
  // Delta from old balance: -3000 (paid 3000 more than before)
  const expectedBalance = startingBalance - oldAmount * paidInstallments + newAmount * paidInstallments
  expect(rec.newBalance).toBe(expectedBalance)
  // Sanity check: balance delta is 3 * (newAmount - oldAmount) = 3 * (-1000) = -3000
  const balanceDelta = rec.newBalance - startingBalance
  const expectedDelta = paidInstallments * (newAmount - oldAmount) // 3 * (-6000 - -5000) = 3 * -1000 = -3000
  expect(balanceDelta).toBe(expectedDelta)
})

// TestDeleteTransaction_ReversesBalance: deleting an applied transaction reverses it: 10000 + 3000 = 13000.
it('TestDeleteTransaction_ReversesBalance', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const startingBalance = 10000
  const txnAmount = -3000

  const state: TxState = { inTx: false }
  let deleteUsedTx = false
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (id: string): Promise<Transaction> => {
      expect(id).toBe(txnId)
      return txn({ id: txnId, accountId, amount: txnAmount })
    },
    deleteById: async (id: string) => {
      expect(id).toBe(txnId)
      deleteUsedTx = state.inTx
    },
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.deleteTransaction(txnId)

  expect(deleteUsedTx).toBe(true)
  expect(rec.newBalance).toBe(13000)
})

// TestDeleteTransaction_PendingPayment_DoesNotAdjustBalanceBeforeConfirmation: deleting an unconfirmed
// pending payment touches neither the balance nor a tx.
it('TestDeleteTransaction_PendingPayment_DoesNotAdjustBalanceBeforeConfirmation', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const txnAmount = -3000

  const state: TxState = { inTx: false }
  let deleteUsedTx = false
  let updateBalanceCalled = false

  const txnsRepo = fakeTransactionsRepo({
    getById: async (id: string): Promise<Transaction> => {
      expect(id).toBe(txnId)
      return txn({ id: txnId, accountId, amount: txnAmount, requiresConfirmation: true })
    },
    deleteById: async (id: string) => {
      expect(id).toBe(txnId)
      deleteUsedTx = state.inTx
    },
  })
  const accRepo = fakeAccountsRepo({
    getById: async (): Promise<Account> => {
      throw new Error('unexpected account read')
    },
    updateBalance: async () => {
      updateBalanceCalled = true
    },
  })

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, null, 0)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.deleteTransaction(txnId)

  expect(deleteUsedTx).toBe(false) // expected non-atomic delete (no balance impact yet)
  expect(updateBalanceCalled).toBe(false)
})

// TestConfirmRecurring_UpdatesBalanceAndAdvancesOccurrence: a weekly recurring transaction is debited
// (10000 - 1500 = 8500) and its next occurrence moves one week on (2026-01-01 -> 2026-01-08).
it('TestConfirmRecurring_UpdatesBalanceAndAdvancesOccurrence', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const startingBalance = 10000
  const amount = -1500
  const nextOccurrence = new Date('2026-01-01T00:00:00Z')

  const state: TxState = { inTx: false }
  let advanceUsedTx = false
  let gotAdvanced = new Date(0)
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (id: string): Promise<Transaction> => {
      expect(id).toBe(txnId)
      return txn({
        id: txnId,
        accountId,
        amount,
        isRecurring: true,
        frequency: FREQ_WEEKLY,
        nextOccurrence,
      })
    },
    advanceNextOccurrence: async (id: string, next: Date) => {
      expect(id).toBe(txnId)
      advanceUsedTx = state.inTx
      gotAdvanced = next
    },
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  const next = await svc.confirmRecurring(txnId)

  const expectedNext = new Date('2026-01-08T00:00:00Z')
  expect(advanceUsedTx).toBe(true)
  expect(rec.newBalance).toBe(8500)
  expect(gotAdvanced).toEqual(expectedNext)
  expect(next).toEqual(expectedNext)
})

// TestConfirmRecurring_PendingPayment_UpdatesBalanceAndMarksConfirmed: a one-time pending payment is
// debited (10000 - 1200 = 8800), marked confirmed in the tx, and has no next occurrence.
it('TestConfirmRecurring_PendingPayment_UpdatesBalanceAndMarksConfirmed', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const startingBalance = 10000
  const amount = -1200

  const state: TxState = { inTx: false }
  let markConfirmedCalled = false
  let markConfirmedUsedTx = false
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (id: string): Promise<Transaction> => {
      expect(id).toBe(txnId)
      return txn({
        id: txnId,
        accountId,
        amount,
        isRecurring: false,
        requiresConfirmation: true,
      })
    },
    markConfirmed: async (id: string, confirmedAt: Date) => {
      expect(id).toBe(txnId)
      expect(confirmedAt).toBeInstanceOf(Date)
      markConfirmedCalled = true
      markConfirmedUsedTx = state.inTx
    },
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  const next = await svc.confirmRecurring(txnId)

  expect(next).toBeNull() // expected zero next occurrence for one-time pending payment
  expect(rec.newBalance).toBe(8800)
  expect(markConfirmedCalled && markConfirmedUsedTx).toBe(true)
})

// TestConfirmRecurring_PendingPaymentAlreadyConfirmed_IsIdempotent: confirming a paid one-time payment again
// does nothing.
it('TestConfirmRecurring_PendingPaymentAlreadyConfirmed_IsIdempotent', async () => {
  const txnId = crypto.randomUUID()
  const confirmedAt = new Date()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (id: string): Promise<Transaction> => {
      expect(id).toBe(txnId)
      return txn({ id: txnId, isRecurring: false, confirmedAt })
    },
  })
  const accRepo = fakeAccountsRepo({
    getById: async (): Promise<Account> => {
      throw new Error('unexpected account read')
    },
    updateBalance: async () => {
      throw new Error('unexpected balance update')
    },
  })

  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  const next = await svc.confirmRecurring(txnId)
  expect(next).toBeNull()
})

// TestConfirmInstallment_DebitsBalanceAndIncrementsCount: one installment of -5000 is debited
// (100000 - 5000 = 95000) and the paid count is incremented, inside a tx.
it('TestConfirmInstallment_DebitsBalanceAndIncrementsCount', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const startingBalance = 100000
  const amount = -5000 // -$50.00 per installment
  const total = 12
  const paid = 2

  const state: TxState = { inTx: false }
  let incrementCalled = false
  let incrementUsedTx = false
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        accountId,
        amount,
        isInstallment: true,
        totalInstallments: total,
        paidInstallments: paid,
        frequency: FREQ_MONTHLY,
      }),
    incrementPaidInstallments: async (id: string) => {
      expect(id).toBe(txnId)
      incrementCalled = true
      incrementUsedTx = state.inTx
    },
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.confirmInstallment(txnId)

  expect(incrementCalled && incrementUsedTx).toBe(true)
  expect(rec.newBalance).toBe(95000)
})

// TestConfirmInstallment_AlreadyComplete_ReturnsError: a fully paid installment cannot be confirmed again.
it('TestConfirmInstallment_AlreadyComplete_ReturnsError', async () => {
  const txnId = crypto.randomUUID()
  const total = 3
  const paid = 3 // fully paid

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        isInstallment: true,
        totalInstallments: total,
        paidInstallments: paid,
      }),
  })
  const accRepo = fakeAccountsRepo({})

  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  await expect(svc.confirmInstallment(txnId)).rejects.toThrow() // expected error for fully paid installment
})

// TestConfirmInstallment_NonInstallment_ReturnsError: only installments can be confirmed this way.
it('TestConfirmInstallment_NonInstallment_ReturnsError', async () => {
  const txnId = crypto.randomUUID()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> => txn({ id: txnId, isInstallment: false }),
  })
  const accRepo = fakeAccountsRepo({})

  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  await expect(svc.confirmInstallment(txnId)).rejects.toThrow() // expected error for non-installment txn
})

// TestUpdateTransaction_TotalInstallments_CanIncrease: total_installments 12 -> 15 with 3 paid succeeds.
it('TestUpdateTransaction_TotalInstallments_CanIncrease', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const total = 12
  const paid = 3
  const newTotal = 15

  let updatedTotal: number | undefined

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        accountId,
        isInstallment: true,
        totalInstallments: total,
        paidInstallments: paid,
      }),
    update: async (_id: string, upd: UpdateTransaction) => {
      updatedTotal = upd.totalInstallments
    },
  })
  const accRepo = fakeAccountsRepo({})

  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  await svc.updateTransaction(txnId, { totalInstallments: newTotal })

  expect(updatedTotal).toBe(newTotal)
})

// TestUpdateTransaction_TotalInstallments_CannotBecomeLessThanPaid: total_installments 2 with 3 paid is an
// error, and the repo is not called.
it('TestUpdateTransaction_TotalInstallments_CannotBecomeLessThanPaid', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const total = 12
  const paid = 3
  const newTotal = 2 // less than paid

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        accountId,
        isInstallment: true,
        totalInstallments: total,
        paidInstallments: paid,
      }),
    update: async () => {
      throw new Error('repo Update should not be called when validation fails')
    },
  })
  const accRepo = fakeAccountsRepo({})

  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  await expect(svc.updateTransaction(txnId, { totalInstallments: newTotal })).rejects.toThrow('cannot be less than')
})

// TestDeleteInstallment_ReversesAllPaidInstallments: deleting an installment with 3 paid reverses all 3:
// 100000 + 3 * 5000 = 115000.
it('TestDeleteInstallment_ReversesAllPaidInstallments', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const startingBalance = 100000
  const amount = -5000 // -$50.00 per installment
  const total = 12
  const paid = 3

  const state: TxState = { inTx: false }
  const rec = freshRecorded()

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        accountId,
        amount,
        isInstallment: true,
        totalInstallments: total,
        paidInstallments: paid,
      }),
    deleteById: async () => undefined,
  })
  const accRepo = scopedAccountRepo(state, accountId, startingBalance, rec)

  const tracked = trackingDb(db, state)
  const ledgerSvc = newTestLedgerSvc(tracked, accRepo, accountId, startingBalance)
  const svc = new TransactionsService(tracked, txnsRepo, accRepo, ledgerSvc)
  await svc.deleteTransaction(txnId)

  // Reversed: 3 * (-$50) = -$150 removed from balance -> balance goes up by $150
  expect(rec.newBalance).toBe(115000)
})

// TestUpdateTransaction_ExistingInstallment_SkipsRequiredFieldValidation: a PATCH that keeps an existing
// installment an installment does not need the installment fields again.
it('TestUpdateTransaction_ExistingInstallment_SkipsRequiredFieldValidation', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()

  // Transaction is already an installment: PATCH sends is_installment: true
  // but does NOT include total_installments, anchor_date, or frequency.
  const isInstallment = true
  const newDesc = 'Updated description'

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        accountId,
        isInstallment: true,
        paidInstallments: 1,
        amount: -5000,
      }),
    update: async () => undefined,
  })
  const accRepo = fakeAccountsRepo({})

  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  await svc.updateTransaction(txnId, {
    isInstallment,
    title: newDesc,
  })
})

// TestUpdateTransaction_SwitchToInstallment_StillValidates: turning a plain transaction into an installment
// needs total_installments, anchor_date and frequency.
it('TestUpdateTransaction_SwitchToInstallment_StillValidates', async () => {
  const txnId = crypto.randomUUID()
  const accountId = crypto.randomUUID()

  // Transaction is NOT an installment: switching to installment must validate.
  const isInstallment = true

  const txnsRepo = fakeTransactionsRepo({
    getById: async (): Promise<Transaction> =>
      txn({
        id: txnId,
        accountId,
        isInstallment: false,
      }),
  })
  const accRepo = fakeAccountsRepo({})

  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  // Missing total_installments, anchor_date, frequency
  await expect(svc.updateTransaction(txnId, { isInstallment })).rejects.toThrow('total_installments')
})

// Not a Go test: an unknown id reaches the caller as an error that isErr(ErrNoRows) (the handlers map
// it to 404), as Go's errors.Is does.
it('DeleteTransaction of an unknown id rejects with ErrNoRows', async () => {
  const txnsRepo = fakeTransactionsRepo({})
  const accRepo = fakeAccountsRepo({})
  const ledgerSvc = newTestLedgerSvc(db, accRepo, null, 0)
  const svc = new TransactionsService(db, txnsRepo, accRepo, ledgerSvc)
  const err = await svc.deleteTransaction(crypto.randomUUID()).then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(isErr(err, ErrNoRows)).toBe(true)
})
