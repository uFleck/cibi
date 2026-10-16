// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../domain/app'
import { setDb } from '../domain/db'
import { resetRoutesForTests } from '../domain/http'
import { registerSettingsRoutes } from '../domain/handlers/settings'
import { createTestDb } from '../domain/testing/testDb'
import { getSetting, putSetting } from './api'

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

describe('settings client', () => {
  it('getSetting is null for an unset key', async () => {
    expect(await getSetting('layout.v1')).toBeNull()
  })

  it('putSetting then getSetting round-trips a JSON value', async () => {
    const layout = { pos: 'off', wall: [{ id: 'kpis', span: 12 }], insp: [{ id: 'goals' }] }
    await expect(putSetting('layout.v1', layout)).resolves.toBeUndefined()
    expect(await getSetting('layout.v1')).toEqual(layout)
  })

  it('keeps dotted keys apart from each other', async () => {
    await putSetting('layout.v1', 1)
    await putSetting('layout.base', 'w2')
    expect(await getSetting('layout.v1')).toBe(1)
    expect(await getSetting('layout.base')).toBe('w2')
  })

  it('throws the server message for an invalid key', async () => {
    await expect(putSetting('bad key', 1)).rejects.toThrow('invalid setting key')
  })
})
