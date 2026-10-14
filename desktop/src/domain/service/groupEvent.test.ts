// @vitest-environment node
// Ports of internal/service/group_event_test.go (3 tests). The Go mockGroupEventRepo is fakeGroupEventRepo
// (testing/fakesPeerGroup.ts). The Go nil friend repo is fakeFriendRepo(), which the service never calls.
import { expect, it } from 'vitest'
import { fakeFriendRepo, fakeGroupEventRepo } from '../testing/fakesPeerGroup'
import { GroupEventService } from './groupEvent'

// TestListEventsByAccount_UsesScopedRepoPath
it('TestListEventsByAccount_UsesScopedRepoPath', async () => {
  const accountId = crypto.randomUUID()
  let captured: string | null | undefined

  const repo = fakeGroupEventRepo({
    getAll: async (accountPtr) => {
      captured = accountPtr
      return []
    },
  })

  const svc = new GroupEventService(repo, fakeFriendRepo())
  await svc.listEventsByAccount(accountId)
  expect(captured).not.toBeNull()
  expect(captured).toBe(accountId)
})

// TestGetPendingBalanceForAdminByAccount_UsesScopedRepoPath
it('TestGetPendingBalanceForAdminByAccount_UsesScopedRepoPath', async () => {
  const accountId = crypto.randomUUID()
  let captured: string | null | undefined

  const repo = fakeGroupEventRepo({
    getPendingBalanceForAdmin: async (accountPtr) => {
      captured = accountPtr
      return { theyOweAdmin: 1200, adminOwesHost: 300 }
    },
  })

  const svc = new GroupEventService(repo, fakeFriendRepo())
  const b = await svc.getPendingBalanceForAdminByAccount(accountId)
  expect(b).toEqual({ theyOweAdmin: 1200, adminOwesHost: 300 })
  expect(captured).not.toBeNull()
  expect(captured).toBe(accountId)
})

// TestEqualSplitAmounts_RemainderGoesToFirstParticipant
it('TestEqualSplitAmounts_RemainderGoesToFirstParticipant', () => {
  const svc = new GroupEventService(fakeGroupEventRepo(), fakeFriendRepo())
  const shares = svc.equalSplitAmounts(100, 3)
  expect(shares).toHaveLength(3)
  expect(shares).toEqual([34, 33, 33])
})

// Paths the Go tests do not reach.
it('equalSplitAmounts: no shares for a count of 0, and a negative total splits toward zero like Go', () => {
  const svc = new GroupEventService(fakeGroupEventRepo(), fakeFriendRepo())
  expect(svc.equalSplitAmounts(100, 0)).toEqual([])
  expect(svc.equalSplitAmounts(-100, 3)).toEqual([-34, -33, -33])
  expect(svc.equalSplitAmounts(6, 3)).toEqual([2, 2, 2])
  expect(svc.equalSplitAmounts(7, 1)).toEqual([7])
})

it('createEvent assigns an id and a 32-character hex public token', async () => {
  let inserted: { id: string; publicToken: string; notes: string | null } | undefined
  const repo = fakeGroupEventRepo({
    insert: async (e) => {
      inserted = e
    },
  })
  const accountId = crypto.randomUUID()
  const created = await new GroupEventService(repo, fakeFriendRepo()).createEvent(accountId, 'pizza', '2026-06-10', 9000, null)
  expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  expect(created.publicToken).toMatch(/^[0-9a-f]{32}$/)
  expect(created.hostFriendId).toBeNull()
  expect(inserted).toEqual(created)
})

it('addEventTransaction stamps the time and removeEventTransaction passes the id through', async () => {
  let removed: string | undefined
  const repo = fakeGroupEventRepo({
    deleteTransactionById: async (id) => {
      removed = id
    },
  })
  const svc = new GroupEventService(repo, fakeFriendRepo())
  const before = Date.now()
  const t = await svc.addEventTransaction(crypto.randomUUID(), 'beer', 500)
  expect(t.createdAt.getTime()).toBeGreaterThanOrEqual(before)
  expect(t.amount).toBe(500)
  await svc.removeEventTransaction(t.id)
  expect(removed).toBe(t.id)
})
