// @vitest-environment node
// The undo flow through the real domain and database: confirming a bill or a payday can be undone,
// and the statement keeps both the original entry and its reversal.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app'
import { setDb } from './db'
import { localFetch, resetRoutesForTests } from './http'
import { registerRoutes } from './routes'
import { createTestDb } from './testing/testDb'
import type { LedgerEntryResponse } from './handlers/ledger'
import type { TransactionResponse } from './handlers/transactions'
import type { PayScheduleResponse } from './handlers/paySchedule'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

const ACCOUNT = '00000000-0000-4000-8000-000000000001'
const BILL = '00000000-0000-4000-8000-000000000002'
const SCHEDULE = '00000000-0000-4000-8000-000000000003'

let db: TestDb

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
  registerRoutes(buildApp(db))

  await db.query(
    `INSERT INTO Account (id, name, current_balance, currency, safety_buffer) VALUES (?, 'Conta', 100000, 'BRL', 0)`,
    [ACCOUNT],
  )
  await db.query(
    `INSERT INTO ledger (id, account_id, entry_type, amount, description, posted_at)
     VALUES ('00000000-0000-4000-8000-000000000010', ?, 'opening_balance', 100000, 'Saldo inicial', '2026-11-01T00:00:00Z')`,
    [ACCOUNT],
  )
  await db.query(
    `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation)
     VALUES (?, ?, -20000, 'Aluguel', '2026-11-01T00:00:00Z', 1, 'monthly', '2026-11-15T00:00:00Z', '2026-11-15T00:00:00Z', 0)`,
    [BILL, ACCOUNT],
  )
  await db.query(
    `INSERT INTO PaySchedule (id, account_id, frequency, anchor_date, day_of_month2, label, amount)
     VALUES (?, ?, 'monthly', '2026-11-20', NULL, 'Salário', 300000)`,
    [SCHEDULE, ACCOUNT],
  )
})

afterEach(() => {
  resetRoutesForTests()
  vi.useRealTimers()
  db.close()
})

async function balance(): Promise<number> {
  const rows = await db.query<{ current_balance: number }>('SELECT current_balance FROM Account WHERE id = ?', [ACCOUNT])
  return rows[0]?.current_balance ?? 0
}

async function ledger(): Promise<LedgerEntryResponse[]> {
  const res = await localFetch(`/api/ledger?account_id=${ACCOUNT}`)
  expect(res.status).toBe(200)
  return (await res.json()) as LedgerEntryResponse[]
}

describe('undo a bill payment', () => {
  it('restores the balance and the due date, and keeps the original with a reversal', async () => {
    const paid = await localFetch(`/api/transactions/${BILL}/confirm`, { method: 'POST' })
    expect(paid.status).toBe(200)
    const afterPay = (await paid.json()) as TransactionResponse
    expect(afterPay.next_occurrence).toBe('2026-12-15T00:00:00Z')
    expect(await balance()).toBe(80000)

    const undone = await localFetch(`/api/transactions/${BILL}/unconfirm`, { method: 'POST' })
    expect(undone.status).toBe(200)
    const afterUndo = (await undone.json()) as TransactionResponse
    expect(afterUndo.next_occurrence).toBe('2026-11-15T00:00:00Z')
    expect(await balance()).toBe(100000)

    const entries = await ledger()
    const payment = entries.find(entry => entry.entry_type === 'payment')
    const reversal = entries.find(entry => entry.reverses_entry_id === payment?.id)
    expect(payment?.reversed_by_id).toBe(reversal?.id)
    expect(reversal?.amount).toBe(200)
  })

  it('refuses a second undo when there is no payment left', async () => {
    await localFetch(`/api/transactions/${BILL}/confirm`, { method: 'POST' })
    await localFetch(`/api/transactions/${BILL}/unconfirm`, { method: 'POST' })
    const again = await localFetch(`/api/transactions/${BILL}/unconfirm`, { method: 'POST' })
    expect(again.status).toBe(400)
  })
})

describe('undo a confirmed payday', () => {
  it('reverses the income and puts the anchor back', async () => {
    const listBefore = await localFetch(`/api/pay-schedule?account_id=${ACCOUNT}`)
    const before = (await listBefore.json()) as PayScheduleResponse[]
    expect(before[0]?.next_payday).toBe('2026-11-19')

    const confirmed = await localFetch(`/api/pay-schedule/${SCHEDULE}/confirm`, { method: 'POST' })
    expect(confirmed.status).toBe(200)
    expect(await balance()).toBe(400000)

    const undone = await localFetch(`/api/pay-schedule/${SCHEDULE}/unconfirm`, { method: 'POST' })
    expect(undone.status).toBe(200)
    const afterUndo = (await undone.json()) as PayScheduleResponse
    expect(afterUndo.anchor_date).toBe('2026-11-19')
    expect(await balance()).toBe(100000)

    const entries = await ledger()
    expect(entries.filter(entry => entry.entry_type === 'income')).toHaveLength(1)
    expect(entries.find(entry => entry.entry_type === 'income')?.reversed_by_id).not.toBeNull()
  })
})

describe('undo an as-needed purchase', () => {
  it('restores the balance and leaves the monthly budget available again', async () => {
    const asNeeded = '00000000-0000-4000-8000-000000000004'
    await db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, is_as_needed)
       VALUES (?, ?, -60000, 'Mercado', '2026-11-01T00:00:00Z', 1, 'monthly', '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z', 1, 1)`,
      [asNeeded, ACCOUNT],
    )

    const paid = await localFetch(`/api/transactions/${asNeeded}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ amount: -150 }),
    })
    expect(paid.status).toBe(200)
    expect(await balance()).toBe(85000)

    const undone = await localFetch(`/api/transactions/${asNeeded}/unconfirm`, { method: 'POST' })
    expect(undone.status).toBe(200)
    expect(await balance()).toBe(100000)

    const rows = await db.query<{ next_occurrence: string; is_as_needed: number }>(
      'SELECT next_occurrence, is_as_needed FROM "Transaction" WHERE id = ?',
      [asNeeded],
    )
    expect(rows[0]).toEqual({ next_occurrence: '2026-11-10T00:00:00Z', is_as_needed: 1 })
  })
})

describe('undo an installment payment', () => {
  it('takes the paid parcel back and restores the balance', async () => {
    const installment = '00000000-0000-4000-8000-000000000005'
    await db.query(
      `INSERT INTO "Transaction" (id, account_id, amount, title, timestamp, is_recurring, frequency, anchor_date, next_occurrence, requires_confirmation, is_installment, total_installments, paid_installments)
       VALUES (?, ?, -10000, 'Celular', '2026-08-20T00:00:00Z', 0, 'monthly', '2026-08-20T00:00:00Z', '2026-11-20T00:00:00Z', 1, 1, 6, 2)`,
      [installment, ACCOUNT],
    )

    const paid = await localFetch(`/api/transactions/${installment}/confirm-installment`, { method: 'POST' })
    expect(paid.status).toBe(200)
    expect(await balance()).toBe(90000)

    const undone = await localFetch(`/api/transactions/${installment}/unconfirm`, { method: 'POST' })
    expect(undone.status).toBe(200)
    expect(await balance()).toBe(100000)

    const rows = await db.query<{ paid_installments: number }>(
      'SELECT paid_installments FROM "Transaction" WHERE id = ?',
      [installment],
    )
    expect(rows[0]?.paid_installments).toBe(2)
  })
})

describe('a new account keeps its opening balance', () => {
  it('records the starting balance as a ledger entry before the first payment', async () => {
    const created = await localFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Nova', current_balance: 500, currency: 'BRL', safety_buffer: 0 }),
    })
    expect(created.status).toBe(201)
    const account = (await created.json()) as { id: string }

    const bill = await localFetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        account_id: account.id,
        amount: -100,
        title: 'Teste',
        is_recurring: true,
        requires_confirmation: true,
        frequency: 'monthly',
        anchor_date: '2026-11-15T00:00:00Z',
      }),
    })
    expect(bill.status).toBe(201)
    const transaction = (await bill.json()) as TransactionResponse

    const paid = await localFetch(`/api/transactions/${transaction.id}/confirm`, { method: 'POST' })
    expect(paid.status).toBe(200)

    const rows = await db.query<{ current_balance: number }>('SELECT current_balance FROM Account WHERE id = ?', [account.id])
    expect(rows[0]?.current_balance).toBe(40000)
    const entries = await db.query<{ entry_type: string; amount: number }>(
      'SELECT entry_type, amount FROM ledger WHERE account_id = ? ORDER BY posted_at',
      [account.id],
    )
    expect(entries).toEqual([
      { entry_type: 'opening_balance', amount: 50000 },
      { entry_type: 'payment', amount: -10000 },
    ])
  })
})

describe('undo a manual ledger entry', () => {  it('adds a reversal and recomputes the balance', async () => {
    const res = await localFetch('/api/ledger/00000000-0000-4000-8000-000000000010/reverse', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await balance()).toBe(0)

    const entries = await ledger()
    expect(entries).toHaveLength(2)
    expect(entries[0]?.amount).toBe(-1000)
    expect(entries[0]?.reverses_entry_id).toBe('00000000-0000-4000-8000-000000000010')
  })
})
