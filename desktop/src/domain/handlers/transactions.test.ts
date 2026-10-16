// @vitest-environment node
// Ports of internal/handler/transactions_test.go (9 tests). The Go mockTransactionsService is a fake here,
// injected through registerTransactionsRoutes(app, fake). Go's makeRequest/serveRequest are localFetch.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { ErrNoRows } from '../errors'
import { localFetch, resetRoutesForTests } from '../http'
import type { Transaction } from '../repo/transactions'
import { createTestDb } from '../testing/testDb'
import { addMonths } from '../dates'
import {
  registerTransactionsRoutes,
  type TransactionResponse,
  type TransactionsServiceIface,
} from './transactions'
import { FREQ_MONTHLY } from '../engine/engine'
import type { NewTransaction } from '../service/transactions'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

/** Go mockTransactionsService: unset methods panic in Go; here they reject, so the test fails. */
function fakeTransactionsService(overrides: Partial<TransactionsServiceIface>): TransactionsServiceIface {
  const unset = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    listTransactions: unset,
    createTransaction: unset,
    getTransaction: unset,
    updateTransaction: unset,
    deleteTransaction: unset,
    confirmRecurring: unset,
    confirmInstallment: unset,
    ...overrides,
  }
}

function withService(fake: TransactionsServiceIface): void {
  registerTransactionsRoutes(buildApp(db), fake)
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

/** A stored transaction with the fields the Go tests set; the rest are Go's zero values. */
function storedTxn(over: Partial<Transaction>): Transaction {
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
    ...over,
  }
}

// TestListTransactions: GET /api/transactions?account_id=<uuid> returns 200 with amounts in dollars.
it('TestListTransactions', async () => {
  const accountId = crypto.randomUUID()
  const txnId = crypto.randomUUID()
  const now = new Date()

  withService(
    fakeTransactionsService({
      listTransactions: async (id: string): Promise<Transaction[]> => {
        expect(id).toBe(accountId)
        return [
          storedTxn({
            id: txnId,
            accountId,
            amount: -2500,
            title: 'Coffee',
            timestamp: now,
            isRecurring: false,
          }),
        ]
      },
    }),
  )

  const res = await localFetch(`/api/transactions?account_id=${accountId}`)
  expect(res.status).toBe(200)
  const resp = await json<TransactionResponse[]>(res)
  expect(resp).toHaveLength(1)
  expect(resp[0]?.amount).toBe(-25.0)
})

// TestListTransactions_MissingAccountID: GET /api/transactions without account_id returns 400 with an error key.
it('TestListTransactions_MissingAccountID', async () => {
  withService(fakeTransactionsService({}))

  const res = await localFetch('/api/transactions')
  expect(res.status).toBe(400)
  const resp = await json<Record<string, string>>(res)
  expect(resp).toHaveProperty('error')
})

// TestCreateTransaction: POST /api/transactions with a valid body returns 201 (unknown fields are ignored).
it('TestCreateTransaction', async () => {
  const accountId = crypto.randomUUID()

  withService(
    fakeTransactionsService({
      createTransaction: async (t: NewTransaction) => {
        expect(t.accountId).toBe(accountId)
        return storedTxn({ ...t, id: t.id ?? '', timestamp: t.timestamp ?? new Date(0) })
      },
    }),
  )

  const body = `{"account_id":"${accountId}","amount":-15.50,"title":"Lunch","category":"Food"}`
  const res = await localFetch('/api/transactions', { method: 'POST', body })
  expect(res.status).toBe(201)
  const resp = await json<TransactionResponse>(res)
  expect(resp.title).toBe('Lunch')
  expect(resp.amount).toBe(-15.5)
})

// TestUpdateTransaction: PATCH /api/transactions/:id returns 200 with the stored transaction.
it('TestUpdateTransaction', async () => {
  const id = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const now = new Date()
  const newDesc = 'Updated Lunch'

  withService(
    fakeTransactionsService({
      updateTransaction: async () => undefined,
      getTransaction: async (): Promise<Transaction> =>
        storedTxn({
          id,
          accountId,
          amount: -1550,
          title: newDesc,
          timestamp: now,
          isRecurring: false,
        }),
    }),
  )

  const res = await localFetch(`/api/transactions/${id}`, {
    method: 'PATCH',
    body: '{"title":"Updated Lunch"}',
  })
  expect(res.status).toBe(200)
  const resp = await json<TransactionResponse>(res)
  expect(resp.title).toBe(newDesc)
})

// TestDeleteTransaction: DELETE /api/transactions/:id returns 204.
it('TestDeleteTransaction', async () => {
  const id = crypto.randomUUID()

  withService(
    fakeTransactionsService({
      deleteTransaction: async () => undefined,
    }),
  )

  const res = await localFetch(`/api/transactions/${id}`, { method: 'DELETE' })
  expect(res.status).toBe(204)
})

// Not a Go test (Go returned 500 here): DELETE of a transaction that has a ledger row (every confirmed
// payment) is 409 with a clear message, and nothing is deleted: the ledger rows are money records.
it('DELETE of a transaction with a ledger row is 409 and deletes nothing', async () => {
  const accountId = crypto.randomUUID()
  await db.query(
    `INSERT INTO Account (id, name, current_balance, currency, safety_buffer, version) VALUES (?, 'Main', 10000, 'BRL', 0, 1)`,
    [accountId],
  )
  registerTransactionsRoutes(buildApp(db))

  // A one-time payment with no confirmation needed is applied on create: it gets a ledger row.
  const created = await localFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, amount: -25, title: 'Lunch' }),
  })
  expect(created.status).toBe(201)
  const { id } = await json<TransactionResponse>(created)

  const res = await localFetch(`/api/transactions/${id}`, { method: 'DELETE' })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'transaction has ledger entries and cannot be deleted' })

  const txns = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "Transaction" WHERE id = ?`, [id])
  expect(txns[0]?.n).toBe(1)
  const ledger = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ledger WHERE transaction_id = ?`, [id])
  expect(ledger[0]?.n).toBe(1)
})

// TestConfirmInstallment_HappyPath: an installment with one month paid returns 200, paid_installments 1, and
// a computed next_occurrence (anchor + 1 month).
it('TestConfirmInstallment_HappyPath', async () => {
  const id = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const now = new Date()
  const total = 6
  const paid = 1
  const anchor = addMonths(now, -1) // one month ago

  withService(
    fakeTransactionsService({
      confirmInstallment: async (txnId: string) => {
        expect(txnId).toBe(id)
      },
      getTransaction: async (): Promise<Transaction> =>
        storedTxn({
          id,
          accountId,
          amount: -5000,
          description: 'Phone',
          timestamp: now,
          isInstallment: true,
          totalInstallments: total,
          paidInstallments: paid,
          frequency: FREQ_MONTHLY,
          anchorDate: anchor,
        }),
    }),
  )

  const res = await localFetch(`/api/transactions/${id}/confirm-installment`, { method: 'POST' })
  expect(res.status).toBe(200)
  const resp = await json<TransactionResponse>(res)
  expect(resp.is_installment).toBe(true)
  expect(resp.paid_installments).toBe(1)
  // next_occurrence should be computed (anchor + 1 month for paid=1)
  expect(resp.next_occurrence).not.toBeNull()
})

// TestConfirmInstallment_InvalidID_Returns400: a malformed id is a 400.
it('TestConfirmInstallment_InvalidID_Returns400', async () => {
  withService(fakeTransactionsService({}))

  const res = await localFetch('/api/transactions/not-a-uuid/confirm-installment', { method: 'POST' })
  expect(res.status).toBe(400)
})

// TestConfirmInstallment_NotFound_Returns404: sql.ErrNoRows is a 404.
it('TestConfirmInstallment_NotFound_Returns404', async () => {
  const id = crypto.randomUUID()
  withService(
    fakeTransactionsService({
      confirmInstallment: async () => {
        throw ErrNoRows
      },
    }),
  )

  const res = await localFetch(`/api/transactions/${id}/confirm-installment`, { method: 'POST' })
  expect(res.status).toBe(404)
})

// TestConfirmInstallment_ServiceError_Returns400: any other service error of confirm-installment is a 400.
it('TestConfirmInstallment_ServiceError_Returns400', async () => {
  const id = crypto.randomUUID()
  withService(
    fakeTransactionsService({
      confirmInstallment: async () => {
        throw new Error('db error')
      },
    }),
  )

  const res = await localFetch(`/api/transactions/${id}/confirm-installment`, { method: 'POST' })
  expect(res.status).toBe(400)
})

it('creates a transaction with a description and links, and PATCH replaces them', async () => {
  const accountId = crypto.randomUUID()
  let stored: Transaction | undefined
  withService(
    fakeTransactionsService({
      createTransaction: async (t) => {
        stored = storedTxn({ ...t, id: crypto.randomUUID() })
        return stored
      },
      updateTransaction: async (_id, upd) => {
        stored = storedTxn({ ...stored, ...(upd.links ? { links: upd.links } : {}) })
      },
      getTransaction: async () => stored as Transaction,
    }),
  )
  const created = await localFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      amount: -50,
      title: 'DAS',
      description: 'Simples Nacional',
      links: [{ url: ' https://example.com/pay ', label: 'Pay' }, { url: 'https://example.com/b' }],
    }),
  })
  expect(created.status).toBe(201)
  const body = await json<{ title: string; description: string; links: { url: string; label: string | null }[] }>(created)
  expect(body.title).toBe('DAS')
  expect(body.description).toBe('Simples Nacional')
  expect(body.links).toEqual([
    { url: 'https://example.com/pay', label: 'Pay' },
    { url: 'https://example.com/b', label: null },
  ])

  const patched = await localFetch(`/api/transactions/${stored?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ links: [{ url: 'https://example.com/c', label: 'C' }] }),
  })
  expect((await json<{ links: unknown[] }>(patched)).links).toEqual([{ url: 'https://example.com/c', label: 'C' }])
})

it('rejects a link that is not an http or https url', async () => {
  withService(fakeTransactionsService({ createTransaction: async (t) => storedTxn({ ...t }) }))
  for (const url of ['javascript:alert(1)', 'file:///c:/secret', 'not a url', '']) {
    const res = await localFetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ account_id: crypto.randomUUID(), amount: -5, title: 'x', links: [{ url }] }),
    })
    expect(res.status).toBe(400)
  }
})
