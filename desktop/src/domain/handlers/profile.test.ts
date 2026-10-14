// @vitest-environment node
// Ports of internal/handler/profile_test.go. The Go mockProfileRepo is a fake here, behind the real
// ProfileService (as in Go). The second block uses the real repo on createTestDb().
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { setDb } from '../db'
import { localFetch, resetRoutesForTests } from '../http'
import type { ProfileRepo, UserProfile } from '../repo/profile'
import { createTestDb } from '../testing/testDb'
import { ProfileService } from '../service/profile'
import { registerProfileRoutes, type ProfileResponse } from './profile'

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

/** Go mockProfileRepo: unknown accounts get a default profile, so GET works before any PATCH. */
class MockProfileRepo implements ProfileRepo {
  private readonly store = new Map<string, UserProfile>()

  async getByAccount(accountId: string): Promise<UserProfile> {
    const p = this.store.get(accountId)
    if (p !== undefined) return p
    return { accountId, displayName: 'User', pixKey: null, theme: 'green-anchor' }
  }

  async upsertByAccount(accountId: string, displayName: string, pixKey: string | null, theme: string): Promise<void> {
    this.store.set(accountId, { accountId, displayName, pixKey, theme })
  }
}

function mockProfileRoutes(): void {
  registerProfileRoutes(buildApp(db), new ProfileService(new MockProfileRepo()))
}

// TestProfileGetIncludesTheme: GET /api/profile returns 200 with a non-empty theme field.
describe('TestProfileGetIncludesTheme', () => {
  it('GET /api/profile returns 200 with a non-empty theme', async () => {
    mockProfileRoutes()
    const accountId = '99999999-9999-4999-8999-999999999999'
    const res = await localFetch(`/api/profile?account_id=${accountId}`)
    expect(res.status).toBe(200)
    const resp = (await res.json()) as ProfileResponse
    expect(resp.theme).not.toBe('')
  })
})

// TestProfilePatchThemeValid: PATCH with a valid theme returns 204, then GET returns the updated theme.
describe('TestProfilePatchThemeValid', () => {
  it('PATCH returns 204, then GET returns the saved theme', async () => {
    mockProfileRoutes()
    const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const body = `{"display_name":"Test","theme":"green-anchor"}`

    const patch = await localFetch(`/api/profile?account_id=${accountId}`, { method: 'PATCH', body })
    expect(patch.status).toBe(204)

    const get = await localFetch(`/api/profile?account_id=${accountId}`)
    expect(get.status).toBe(200)
    const resp = (await get.json()) as ProfileResponse
    expect(resp.theme).toBe('green-anchor')
  })
})

// TestProfilePatchThemeInvalid: PATCH with an unrecognised theme returns 400.
describe('TestProfilePatchThemeInvalid', () => {
  it('PATCH with an unknown theme returns 400 with the list of allowed themes', async () => {
    mockProfileRoutes()
    const accountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const body = `{"display_name":"Test","theme":"purple-haze"}`
    const res = await localFetch(`/api/profile?account_id=${accountId}`, { method: 'PATCH', body })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'invalid theme "purple-haze": must be one of green-anchor, neutral-command, rose-noir, teal-bridge, warm-amber',
    })
  })
})

// ---------------------------------------------------------------------------------------------
// Behavior on the real repo (not Go tests; each expectation follows the Go code).
// ---------------------------------------------------------------------------------------------

describe('profile on the real repo', () => {
  async function seedAccount(id: string): Promise<void> {
    await db.query(
      `INSERT INTO Account (id, name, current_balance, currency, is_default, safety_buffer, version) VALUES (?, 'A', 0, 'BRL', 0, 1000, 1)`,
      [id],
    )
  }

  it('GET without a profile row is 500 with the repo error text (Go quirk, not "internal server error")', async () => {
    const app = buildApp(db)
    registerProfileRoutes(app)
    const accountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const res = await localFetch(`/api/profile?account_id=${accountId}`)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'service.Profile.GetByAccount: profile.GetByAccount: sql: no rows in result set',
    })
  })

  it('PATCH creates the profile, trims the name and PIX key, and stores a blank PIX key as null', async () => {
    const app = buildApp(db)
    registerProfileRoutes(app)
    const accountId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    await seedAccount(accountId)
    const patch = await localFetch(`/api/profile?account_id=${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_name: '  Ana  ', pix_key: '   ', theme: 'rose-noir' }),
    })
    expect(patch.status).toBe(204)
    const stored = await app.profileRepo.getByAccount(accountId)
    expect(stored).toEqual({ accountId, displayName: 'Ana', pixKey: null, theme: 'rose-noir' })
    const get = (await (await localFetch(`/api/profile?account_id=${accountId}`)).json()) as ProfileResponse
    expect(get).toEqual({ display_name: 'Ana', pix_key: null, theme: 'rose-noir' })
  })

  it('a blank display name is 400 "display_name is required" (after trimming)', async () => {
    registerProfileRoutes(buildApp(db))
    const accountId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const res = await localFetch(`/api/profile?account_id=${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_name: '   ', theme: 'warm-amber' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'display_name is required' })
  })

  it('a malformed account_id is 400 "invalid account_id"', async () => {
    registerProfileRoutes(buildApp(db))
    const res = await localFetch('/api/profile?account_id=nope', { method: 'PATCH', body: '{}' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid account_id' })
  })

  it('a missing required field is 400 with the validator text', async () => {
    registerProfileRoutes(buildApp(db))
    const accountId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const res = await localFetch(`/api/profile?account_id=${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_name: 'Ana' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "Key: 'PatchProfileRequest.Theme' Error:Field validation for 'Theme' failed on the 'required' tag",
    })
  })
})
