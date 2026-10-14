// @vitest-environment node
// Ports of internal/handler/accounts_test.go. The Go mocks of AccountsServiceIface are fakes here,
// injected through registerAccountsRoutes(app, fake). The second block runs the real service and
// repos on createTestDb(); it covers the behavior the Go handlers and services have on the same data.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'
import { ErrNoRows, wrap } from '../errors'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import type { Account } from '../repo/accounts'
import { createTestDb } from '../testing/testDb'
import { registerAccountsRoutes, type AccountResponse, type AccountsServiceIface } from './accounts'

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

/** Go mockAccountsService: unset methods panic in Go; here they reject, so the test fails. */
function fakeAccountsService(overrides: Partial<AccountsServiceIface>): AccountsServiceIface {
  const unset = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    listAccounts: unset,
    createAccount: unset,
    getDefault: unset,
    getById: unset,
    setDefault: unset,
    updateAccount: unset,
    deleteAccount: unset,
    ...overrides,
  }
}

function account(overrides: Partial<Account>): Account {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: '',
    currentBalance: 0,
    currency: 'USD',
    isDefault: false,
    safetyBuffer: 0,
    version: 1,
    ...overrides,
  }
}

// TestListAccounts: GET /api/accounts returns 200 + JSON array.
describe('TestListAccounts', () => {
  it('GET /api/accounts returns 200 and the accounts in dollars', async () => {
    const id1 = '11111111-1111-4111-8111-111111111111'
    const app = buildApp(db)
    registerAccountsRoutes(
      app,
      fakeAccountsService({
        listAccounts: async () => [account({ id: id1, name: 'Checking', currentBalance: 10000, currency: 'USD', isDefault: true })],
      }),
    )
    const res = await localFetch('/api/accounts')
    expect(res.status).toBe(200)
    const resp = (await res.json()) as AccountResponse[]
    expect(resp).toHaveLength(1)
    expect(resp[0]?.name).toBe('Checking')
    expect(resp[0]?.current_balance).toBe(100.0)
  })
})

// TestCreateAccount: POST /api/accounts with valid body returns 201.
describe('TestCreateAccount', () => {
  it('POST /api/accounts with a valid body returns 201', async () => {
    const app = buildApp(db)
    registerAccountsRoutes(app, fakeAccountsService({ createAccount: async () => undefined }))
    const body = `{"name":"Savings","current_balance":500.00,"currency":"USD","is_default":false}`
    const res = await localFetch('/api/accounts', { method: 'POST', body })
    expect(res.status).toBe(201)
    const resp = (await res.json()) as AccountResponse
    expect(resp.name).toBe('Savings')
    expect(resp.current_balance).toBe(500.0)
  })
})

// TestGetAccountByID: GET /api/accounts/:id returns 200 for a known ID.
describe('TestGetAccountByID', () => {
  it('GET /api/accounts/:id returns 200 for a known id', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    const app = buildApp(db)
    registerAccountsRoutes(
      app,
      fakeAccountsService({
        getById: async (reqId: string) => {
          if (reqId !== id) throw new Error('unexpected id')
          return account({ id, name: 'Main', currentBalance: 20000, currency: 'USD', isDefault: true })
        },
      }),
    )
    const res = await localFetch(`/api/accounts/${id}`)
    expect(res.status).toBe(200)
    const resp = (await res.json()) as AccountResponse
    expect(resp.id).toBe(id)
  })
})

// TestGetAccountByID_NotFound: an unknown id gives 404 {"error":"account not found"}.
describe('TestGetAccountByID_NotFound', () => {
  it('GET /api/accounts/:id with an unknown id returns 404 with the not-found text', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    const app = buildApp(db)
    registerAccountsRoutes(
      app,
      fakeAccountsService({
        getById: async () => {
          throw wrap('accounts.GetByID', ErrNoRows)
        },
      }),
    )
    const res = await localFetch(`/api/accounts/${id}`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'account not found' })
  })
})

// TestUpdateAccount: PATCH /api/accounts/:id with valid body returns 200.
describe('TestUpdateAccount', () => {
  it('PATCH /api/accounts/:id with a valid body returns 200 and the updated account', async () => {
    const id = '44444444-4444-4444-8444-444444444444'
    const newName = 'Updated'
    const app = buildApp(db)
    registerAccountsRoutes(
      app,
      fakeAccountsService({
        updateAccount: async () => undefined,
        getById: async () => account({ id, name: newName, currentBalance: 5000, currency: 'USD', isDefault: false }),
      }),
    )
    const res = await localFetch(`/api/accounts/${id}`, { method: 'PATCH', body: `{"name":"Updated"}` })
    expect(res.status).toBe(200)
    const resp = (await res.json()) as AccountResponse
    expect(resp.name).toBe(newName)
  })
})

// TestDeleteAccount: DELETE /api/accounts/:id returns 204.
describe('TestDeleteAccount', () => {
  it('DELETE /api/accounts/:id returns 204', async () => {
    const id = '55555555-5555-4555-8555-555555555555'
    const app = buildApp(db)
    registerAccountsRoutes(app, fakeAccountsService({ deleteAccount: async () => undefined }))
    const res = await localFetch(`/api/accounts/${id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
  })
})

// ---------------------------------------------------------------------------------------------
// Behavior on the real service and repos (not Go tests; each expectation follows the Go code).
// ---------------------------------------------------------------------------------------------

function realApp(): App {
  const app = buildApp(db)
  registerAccountsRoutes(app)
  return app
}

async function postAccount(body: unknown): Promise<Response> {
  return localFetch('/api/accounts', { method: 'POST', body: JSON.stringify(body) })
}

describe('accounts on the real service', () => {
  it('create stores the safety buffer default but responds with the request value (Go quirk)', async () => {
    const app = realApp()
    const res = await postAccount({ name: 'Conta', current_balance: 12.5, currency: 'BRL', is_default: true })
    expect(res.status).toBe(201)
    const created = (await res.json()) as AccountResponse
    expect(created.current_balance).toBe(12.5)
    expect(created.safety_buffer).toBe(0)
    const stored = await app.accountsRepo.getById(created.id)
    expect(stored.safetyBuffer).toBe(1000)
    expect(stored.currentBalance).toBe(1250)
  })

  it('create keeps an explicit safety buffer, in cents', async () => {
    const app = realApp()
    const res = await postAccount({ name: 'Conta', current_balance: 0, currency: 'BRL', safety_buffer: 250.5 })
    const created = (await res.json()) as AccountResponse
    expect(created.safety_buffer).toBe(250.5)
    expect((await app.accountsRepo.getById(created.id)).safetyBuffer).toBe(25050)
  })

  it('a new default account clears the previous default', async () => {
    realApp()
    await postAccount({ name: 'A', current_balance: 0, currency: 'BRL', is_default: true })
    await postAccount({ name: 'B', current_balance: 0, currency: 'BRL', is_default: true })
    const res = await localFetch('/api/accounts/default')
    expect(((await res.json()) as AccountResponse).name).toBe('B')
    const list = (await (await localFetch('/api/accounts')).json()) as AccountResponse[]
    expect(list.filter((a) => a.is_default).map((a) => a.name)).toEqual(['B'])
  })

  it('GET /api/accounts/default with no default account is 404 "not found"', async () => {
    realApp()
    const res = await localFetch('/api/accounts/default')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not found' })
  })

  it('an empty account list is [] (Go makes a non-nil slice)', async () => {
    realApp()
    const res = await localFetch('/api/accounts')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('a balance change records a manual_adjustment and sets the balance to the ledger sum (Go quirk)', async () => {
    const app = realApp()
    const created = (await (await postAccount({ name: 'Conta', current_balance: 100, currency: 'BRL' })).json()) as AccountResponse
    const res = await localFetch(`/api/accounts/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_balance: 75.25, safety_buffer: 30 }),
    })
    expect(res.status).toBe(200)
    const updated = (await res.json()) as AccountResponse
    // Create writes no ledger row, so the only entry is the adjustment (-100 -> 75.25 is -24.75),
    // and the balance becomes the sum of the ledger: -24.75, not 75.25.
    expect(updated.current_balance).toBe(-24.75)
    expect(updated.safety_buffer).toBe(30)
    const entries = await app.ledgerRepo.listByAccount(created.id)
    expect(entries.map((e) => [e.entryType, e.amount, e.description])).toEqual([
      ['manual_adjustment', -2475, 'Manual balance adjustment'],
    ])
  })

  it('PATCH with an empty name is accepted and stores the empty name (Go has no check)', async () => {
    realApp()
    const created = (await (await postAccount({ name: 'Conta', current_balance: 0, currency: 'BRL' })).json()) as AccountResponse
    const res = await localFetch(`/api/accounts/${created.id}`, { method: 'PATCH', body: '{"name":""}' })
    expect(((await res.json()) as AccountResponse).name).toBe('')
  })

  it('PATCH of an unknown id is 404 "account not found" (the account is read back after the update)', async () => {
    realApp()
    const res = await localFetch('/api/accounts/66666666-6666-4666-8666-666666666666', {
      method: 'PATCH',
      body: '{"name":"x"}',
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'account not found' })
  })

  it('set-default on an unknown id returns 204 and clears the current default (Go quirk)', async () => {
    realApp()
    await postAccount({ name: 'A', current_balance: 0, currency: 'BRL', is_default: true })
    const res = await localFetch('/api/accounts/77777777-7777-4777-8777-777777777777/set-default', { method: 'POST' })
    expect(res.status).toBe(204)
    expect((await localFetch('/api/accounts/default')).status).toBe(404)
  })

  it('delete of an unknown id returns 204 (Go does not check rows affected)', async () => {
    realApp()
    const res = await localFetch('/api/accounts/88888888-8888-4888-8888-888888888888', { method: 'DELETE' })
    expect(res.status).toBe(204)
  })

  it('delete removes the account and its ledger entries', async () => {
    const app = realApp()
    const created = (await (await postAccount({ name: 'Conta', current_balance: 10, currency: 'BRL' })).json()) as AccountResponse
    await localFetch(`/api/accounts/${created.id}`, { method: 'PATCH', body: '{"current_balance":20}' })
    expect((await localFetch(`/api/accounts/${created.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await localFetch(`/api/accounts/${created.id}`)).status).toBe(404)
    expect(await app.ledgerRepo.listByAccount(created.id)).toEqual([])
  })

  it('a 32-hex-digit id in the path is accepted and matches the canonical stored id', async () => {
    realApp()
    const created = (await (await postAccount({ name: 'Conta', current_balance: 1, currency: 'BRL' })).json()) as AccountResponse
    const hex = created.id.replaceAll('-', '')
    const res = await localFetch(`/api/accounts/${hex}`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as AccountResponse).id).toBe(created.id)
  })

  it('a malformed id is 400 "invalid account id"', async () => {
    realApp()
    const res = await localFetch('/api/accounts/not-a-uuid')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid account id' })
  })

  it('a missing required field is 400 with the validator text', async () => {
    realApp()
    const res = await postAccount({ current_balance: 1 })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error:
        "Key: 'CreateAccountRequest.Name' Error:Field validation for 'Name' failed on the 'required' tag\n" +
        "Key: 'CreateAccountRequest.Currency' Error:Field validation for 'Currency' failed on the 'required' tag",
    })
  })

  it('a value of the wrong JSON type is 400', async () => {
    realApp()
    const res = await postAccount({ name: 'Conta', current_balance: '1', currency: 'BRL' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid request body' })
  })

  it('JSON keys bind case-insensitively, as encoding/json does', async () => {
    realApp()
    const res = await postAccount({ NAME: 'Conta', Current_Balance: 3, Currency: 'BRL' })
    expect(res.status).toBe(201)
    expect(((await res.json()) as AccountResponse).name).toBe('Conta')
  })
})
