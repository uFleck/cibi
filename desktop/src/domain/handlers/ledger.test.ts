// @vitest-environment node
// Behavior tests for internal/handler/ledger.go on the real service and repos. The Go repo has no
// ledger tests of its own; each expectation follows the Go code and, where noted, a row shape from
// the real database.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { createTestDb } from '../testing/testDb'
import { registerLedgerRoutes, type LedgerEntryResponse } from './ledger'
import { registerAccountsRoutes, type AccountResponse } from './accounts'

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

const ACCOUNT = '75b9ae41-4ae4-4d7e-aaf9-4579aafb89cb'
const PAY_SCHEDULE = '0d0c6a52-2b1e-4c3a-9f7e-3a1b2c3d4e5f'

async function seedAccount(): Promise<void> {
  await db.query(
    `INSERT INTO Account (id, name, current_balance, currency, is_default, safety_buffer, version) VALUES (?, 'Umbler', 0, 'BRL', 1, 0, 1)`,
    [ACCOUNT],
  )
}

async function seedPaySchedule(): Promise<void> {
  await db.query(`INSERT INTO PaySchedule (id) VALUES (?)`, [PAY_SCHEDULE])
}

function balanceOf(id: string): Promise<number> {
  return db.query<{ b: number }>(`SELECT current_balance AS b FROM Account WHERE id = ?`, [id]).then((r) => r[0]?.b ?? -1)
}

describe('GET /api/ledger', () => {
  it('a missing or malformed account_id is 400 "invalid account_id"', async () => {
    registerLedgerRoutes(buildApp(db))
    for (const path of ['/api/ledger', '/api/ledger?account_id=nope']) {
      const res = await localFetch(path)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid account_id' })
    }
  })

  it('an account with no entries returns [] (non-nil slice)', async () => {
    await seedAccount()
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch(`/api/ledger?account_id=${ACCOUNT}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('reads both posted_at forms and a 32-digit id from the real database as the Go server writes them', async () => {
    await seedAccount()
    // The two real row shapes: RFC3339 written by Go, and "YYYY-MM-DD HH:MM:SS" with a hex-only id.
    await db.query(
      `INSERT INTO ledger (id, account_id, entry_type, amount, description, posted_at) VALUES
       ('1b01c415e71b90ae437d813dec6725ec', ?, 'opening_balance', 47252, 'Opening balance', '2026-09-11 20:01:19'),
       ('0047ec97-908e-49f2-8fd4-702ea096a11b', ?, 'manual_adjustment', -37857, 'Manual balance adjustment', '2026-09-12T02:26:36Z')`,
      [ACCOUNT, ACCOUNT],
    )
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch(`/api/ledger?account_id=${ACCOUNT}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as LedgerEntryResponse[]
    expect(body).toEqual([
      {
        id: '0047ec97-908e-49f2-8fd4-702ea096a11b',
        account_id: ACCOUNT,
        transaction_id: null,
        pay_schedule_id: null,
        entry_type: 'manual_adjustment',
        amount: -378.57,
        description: 'Manual balance adjustment',
        posted_at: '2026-09-12T02:26:36Z',
      },
      {
        id: '1b01c415-e71b-90ae-437d-813dec6725ec',
        account_id: ACCOUNT,
        transaction_id: null,
        pay_schedule_id: null,
        entry_type: 'opening_balance',
        amount: 472.52,
        description: 'Opening balance',
        posted_at: '2026-09-11T20:01:19Z',
      },
    ])
  })
})

describe('POST /api/ledger/income', () => {
  it('records an income entry in cents and sets the balance to the ledger sum', async () => {
    await seedAccount()
    await seedPaySchedule()
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch('/api/ledger/income', {
      method: 'POST',
      body: JSON.stringify({ account_id: ACCOUNT, pay_schedule_id: PAY_SCHEDULE, amount: 150000, description: 'Salário' }),
    })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('')
    expect(await balanceOf(ACCOUNT)).toBe(150000)
    const rows = await db.query<{ entry_type: string; amount: number; pay_schedule_id: string }>(
      `SELECT entry_type, amount, pay_schedule_id FROM ledger WHERE account_id = ?`,
      [ACCOUNT],
    )
    expect(rows).toEqual([{ entry_type: 'income', amount: 150000, pay_schedule_id: PAY_SCHEDULE }])
  })

  it('an amount of 0 fails the required check and gives 500 "internal server error" (Go quirk)', async () => {
    await seedAccount()
    await seedPaySchedule()
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch('/api/ledger/income', {
      method: 'POST',
      body: JSON.stringify({ account_id: ACCOUNT, pay_schedule_id: PAY_SCHEDULE, amount: 0, description: 'x' }),
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal server error' })
  })

  it('a missing description fails the required check the same way (500)', async () => {
    await seedAccount()
    await seedPaySchedule()
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch('/api/ledger/income', {
      method: 'POST',
      body: JSON.stringify({ account_id: ACCOUNT, pay_schedule_id: PAY_SCHEDULE, amount: 100 }),
    })
    expect(res.status).toBe(500)
  })

  it('a malformed account_id is 400 "invalid account_id" (after the validation check)', async () => {
    await seedPaySchedule()
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch('/api/ledger/income', {
      method: 'POST',
      body: JSON.stringify({ account_id: 'nope', pay_schedule_id: PAY_SCHEDULE, amount: 100, description: 'x' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid account_id' })
  })

  it('a non-integer amount is 400 (it does not bind to int64)', async () => {
    await seedAccount()
    await seedPaySchedule()
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch('/api/ledger/income', {
      method: 'POST',
      body: JSON.stringify({ account_id: ACCOUNT, pay_schedule_id: PAY_SCHEDULE, amount: 1.5, description: 'x' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid request body' })
  })

  it('an unknown account is 500 "internal server error" (foreign key failure)', async () => {
    await seedPaySchedule()
    registerLedgerRoutes(buildApp(db))
    const res = await localFetch('/api/ledger/income', {
      method: 'POST',
      body: JSON.stringify({ account_id: ACCOUNT, pay_schedule_id: PAY_SCHEDULE, amount: 100, description: 'x' }),
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal server error' })
  })
})

describe('DELETE /api/ledger/:id', () => {
  it('deletes the entry and recomputes the balance', async () => {
    await seedAccount()
    await seedPaySchedule()
    const app = buildApp(db)
    registerLedgerRoutes(app)
    registerAccountsRoutes(app)
    await localFetch('/api/ledger/income', {
      method: 'POST',
      body: JSON.stringify({ account_id: ACCOUNT, pay_schedule_id: PAY_SCHEDULE, amount: 500, description: 'x' }),
    })
    const [entry] = await app.ledgerRepo.listByAccount(ACCOUNT)
    expect(entry).toBeDefined()
    const res = await localFetch(`/api/ledger/${entry?.id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(await balanceOf(ACCOUNT)).toBe(0)
    const account = (await (await localFetch(`/api/accounts/${ACCOUNT}`)).json()) as AccountResponse
    expect(account.current_balance).toBe(0)
  })

  it('an unknown id is 404 "ledger entry not found", and a malformed id is 400 "invalid id"', async () => {
    registerLedgerRoutes(buildApp(db))
    const missing = await localFetch('/api/ledger/11111111-1111-4111-8111-111111111111', { method: 'DELETE' })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'ledger entry not found' })
    const bad = await localFetch('/api/ledger/income', { method: 'DELETE' })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid id' })
  })
})
