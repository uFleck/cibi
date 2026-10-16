// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import { createTestDb } from '../testing/testDb'
import { registerSettingsRoutes } from './settings'

type TestDb = Awaited<ReturnType<typeof createTestDb>>

let db: TestDb

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
  registerSettingsRoutes(buildApp(db))
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

const put = (key: string, body?: string) =>
  localFetch(`/api/settings/${key}`, body === undefined ? { method: 'PUT' } : { method: 'PUT', body })

describe('GET /api/settings/:key', () => {
  it('answers 200 with null for a key that was never set', async () => {
    const res = await localFetch('/api/settings/layout.v1')
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })
})

describe('PUT /api/settings/:key', () => {
  it('stores the JSON body and answers 204; GET returns it decoded', async () => {
    const value = { pos: 'left', wall: [{ id: 'kpis', span: 12 }], insp: [] }
    const res = await put('layout.v1', JSON.stringify(value))
    expect(res.status).toBe(204)

    const got = await localFetch('/api/settings/layout.v1')
    expect(await got.json()).toEqual(value)
  })

  it('replaces the previous value', async () => {
    await put('layout.base', '"w1"')
    await put('layout.base', '"w3"')
    expect(await (await localFetch('/api/settings/layout.base')).json()).toBe('w3')
  })

  it('accepts a JSON null as a value', async () => {
    expect((await put('k', 'null')).status).toBe(204)
    expect(await (await localFetch('/api/settings/k')).json()).toBeNull()
  })

  it('answers 400 when there is no body', async () => {
    const res = await put('layout.v1')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'value is required' })
  })

  it('answers 400 for a body that is not JSON', async () => {
    const res = await put('layout.v1', '{nope')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid request body' })
  })

  it.each(['bad%20key', 'a%2Fb', 'x'.repeat(65)])('answers 400 for the invalid key %s', async (key) => {
    const res = await put(key, '1')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid setting key' })
  })

  it('rejects an invalid key on GET too', async () => {
    const res = await localFetch('/api/settings/bad%20key')
    expect(res.status).toBe(400)
  })

  it('keeps values on the same database across requests', async () => {
    await put('k', '{"a":1}')
    const rows = await db.query("SELECT value FROM AppSetting WHERE key = 'k'")
    expect(rows).toEqual([{ value: '{"a":1}' }])
  })
})
