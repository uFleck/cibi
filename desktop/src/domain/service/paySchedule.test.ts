// @vitest-environment node
// Ports of internal/service/pay_schedule_test.go. The Go mocks are fakes implementing the TS
// repo interfaces; the LedgerService is the real one, over a fake ledger repo (as in Go). The
// Go "used tx" checks become checks that the update ran inside db.tx().
// The Go stubs TestCanIBuyIt_Stub and TestWaitVerdict_Stub belong to the engine slice; they are
// t.Skip stubs and are not ported here.
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Db } from '../db'
import { ErrNoRows, isErr } from '../errors'
import type { Account, AccountsRepo } from '../repo/accounts'
import type { LedgerEntry, LedgerRepo, NewLedgerEntry } from '../repo/ledger'
import type { PaySchedule, PayScheduleRepo } from '../repo/paySchedule'
import { createTestDb } from '../testing/testDb'
import { LedgerService } from './ledger'
import { PayScheduleService } from './paySchedule'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  db.close()
})

/** Go mock methods that a test does not set panic in Go; here they reject, so the test fails. */
const unset = async (): Promise<never> => {
  throw new Error('not implemented')
}

/** Records whether the work runs inside db.tx(): the TS form of Go's "used tx" checks. */
interface TxState {
  inTx: boolean
}

function trackingDb(base: TestDb, state: TxState): Db {
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

function fakeAccountsRepo(overrides: Partial<AccountsRepo>): AccountsRepo {
  return {
    insert: unset,
    getAll: unset,
    getById: unset,
    updateBalance: unset,
    updateName: unset,
    updateSafetyBuffer: unset,
    deleteById: unset,
    incrementVersion: unset,
    ...overrides,
  }
}

function fakePayScheduleRepo(overrides: Partial<PayScheduleRepo>): PayScheduleRepo {
  return {
    insert: unset,
    listByAccountId: unset,
    getById: unset,
    updateById: unset,
    updateAnchorDate: unset,
    deleteById: unset,
    ...overrides,
  }
}

/** Go mockLedgerRepo, seeded with one opening_balance entry (Go newTestLedgerSvc). */
function fakeLedgerRepo(accountId: string, seedBalance: number): LedgerRepo {
  const entries: LedgerEntry[] = [
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
  return {
    insert: async (e: NewLedgerEntry) => {
      entries.push({ ...e, id: e.id ?? crypto.randomUUID() })
    },
    listByAccount: unset,
    deleteById: unset,
    findByTransactionId: unset,
    findById: unset,
    sumByAccount: async (id: string) =>
      entries.filter((e) => e.accountId === id).reduce((sum, e) => sum + e.amount, 0),
    updateAmount: unset,
  }
}

// TestPayScheduleService_ConfirmPayday_UpdatesBalanceAndAnchor: confirming a monthly schedule
// credits the amount (100000 + 300000 = 400000) and advances the anchor, both inside a tx.
it('TestPayScheduleService_ConfirmPayday_UpdatesBalanceAndAnchor', async () => {
  const scheduleId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const anchor = new Date('2026-01-10T00:00:00Z')

  const state: TxState = { inTx: false }
  let gotBalance = 0
  let gotAnchor = new Date(0)
  let updateBalanceUsedTx = false
  let updateAnchorUsedTx = false

  const psRepo = fakePayScheduleRepo({
    getById: async (id: string): Promise<PaySchedule> => {
      expect(id).toBe(scheduleId)
      return {
        id: scheduleId,
        accountId,
        frequency: 'monthly',
        anchorDate: anchor,
        dayOfMonth2: null,
        label: null,
        amount: 300000,
      }
    },
    updateAnchorDate: async (id: string, nextAnchor: Date) => {
      expect(id).toBe(scheduleId)
      updateAnchorUsedTx = state.inTx
      gotAnchor = nextAnchor
    },
  })

  const accRepo = fakeAccountsRepo({
    getById: async (id: string): Promise<Account> => {
      expect(id).toBe(accountId)
      return {
        id: accountId,
        name: '',
        currentBalance: 100000,
        currency: 'BRL',
        safetyBuffer: 0,
        version: 1,
      }
    },
    updateBalance: async (id: string, balance: number) => {
      expect(id).toBe(accountId)
      updateBalanceUsedTx = state.inTx
      gotBalance = balance
    },
  })

  const tracked = trackingDb(db, state)
  const ledgerSvc = new LedgerService(tracked, fakeLedgerRepo(accountId, 100000), accRepo)
  const svc = new PayScheduleService(tracked, psRepo, accRepo, ledgerSvc)
  const updated = await svc.confirmPayday(scheduleId)

  expect(updateBalanceUsedTx && updateAnchorUsedTx).toBe(true)
  expect(gotBalance).toBe(400000)
  expect(gotAnchor.getTime()).toBeGreaterThan(anchor.getTime())
  expect(updated.anchorDate).toEqual(gotAnchor)
})

// TestPayScheduleService_ConfirmPayday_GetScheduleError: a missing schedule is an error.
it('TestPayScheduleService_ConfirmPayday_GetScheduleError', async () => {
  const scheduleId = crypto.randomUUID()

  const psRepo = fakePayScheduleRepo({
    getById: async () => {
      throw ErrNoRows
    },
  })
  const accRepo = fakeAccountsRepo({})

  const ledgerSvc = new LedgerService(db, fakeLedgerRepo(scheduleId, 0), accRepo)
  const svc = new PayScheduleService(db, psRepo, accRepo, ledgerSvc)
  const err = await svc.confirmPayday(scheduleId).then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(err).toBeDefined()
  expect(isErr(err, ErrNoRows)).toBe(true)
})
