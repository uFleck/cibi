// @vitest-environment node
// Ports of internal/service/peer_debt_test.go (3 tests). The Go mockPeerDebtRepo is fakePeerDebtRepo
// (testing/fakesPeerGroup.ts). The Go scoped-pointer checks compare the account id the repo received.
import { expect, it } from 'vitest'
import type { ActiveUserDebt, PeerDebt } from '../repo/peerDebt'
import { fakePeerDebtRepo } from '../testing/fakesPeerGroup'
import { PeerDebtService } from './peerDebt'

// TestGetFriendDebtBreakdown_InstallmentComputesNextPaymentDate
it('TestGetFriendDebtBreakdown_InstallmentComputesNextPaymentDate', async () => {
  const repo = fakePeerDebtRepo({
    getActiveUserDebtsWithFriend: async (): Promise<ActiveUserDebt[]> => [
      {
        friendName: 'Ana',
        amount: -10000,
        isInstallment: true,
        totalInstallments: 4,
        paidInstallments: 2,
        frequency: 'monthly',
        date: '2026-01-01T00:00:00Z',
        anchorDate: null,
      },
    ],
  })

  const svc = new PeerDebtService(repo)
  const items = await svc.getFriendDebtBreakdown(null)
  expect(items).toHaveLength(1)
  expect(items[0]?.nextPayment).toBe(2500)
  expect(items[0]?.nextPaymentDate).not.toBeNull()
  expect(items[0]?.nextPaymentDate).toBe('2026-03-01T00:00:00Z')
})

// TestGetFriendDebtBreakdownByAccount_UsesScopedPath
it('TestGetFriendDebtBreakdownByAccount_UsesScopedPath', async () => {
  const accountId = crypto.randomUUID()
  let captured: string | null | undefined

  const repo = fakePeerDebtRepo({
    getActiveUserDebtsWithFriend: async (accountPtr) => {
      captured = accountPtr
      return []
    },
  })

  const svc = new PeerDebtService(repo)
  await svc.getFriendDebtBreakdownByAccount(accountId)
  expect(captured).not.toBeNull()
  expect(captured).toBe(accountId)
})

// TestSumNextUserPaymentByAccount_UsesOptionalAccountRepoCall
it('TestSumNextUserPaymentByAccount_UsesOptionalAccountRepoCall', async () => {
  const accountId = crypto.randomUUID()
  let captured: string | null | undefined

  const repo = fakePeerDebtRepo({
    sumNextUserPayment: async (accountPtr) => {
      captured = accountPtr
      return 4242
    },
  })

  const svc = new PeerDebtService(repo)
  const sum = await svc.sumNextUserPaymentByAccount(accountId)
  expect(sum).toBe(4242)
  expect(captured).not.toBeNull()
  expect(captured).toBe(accountId)
})

// Breakdown branches the Go tests do not reach (Go buildFriendDebtItems).
it('a lump-sum debt is one payment due on its date as stored, and an installment uses the anchor date', async () => {
  const repo = fakePeerDebtRepo({
    getActiveUserDebtsWithFriend: async (): Promise<ActiveUserDebt[]> => [
      {
        friendName: 'Bia',
        amount: -2001,
        isInstallment: false,
        totalInstallments: 0,
        paidInstallments: 0,
        frequency: '',
        date: '2026-06-10',
        anchorDate: null,
      },
      {
        friendName: 'Caio',
        amount: -1000,
        isInstallment: true,
        totalInstallments: 3,
        paidInstallments: 1,
        frequency: 'weekly',
        date: '2026-01-01',
        anchorDate: '2026-02-01T00:00:00Z',
      },
    ],
  })
  const items = await new PeerDebtService(repo).getFriendDebtBreakdown(null)
  expect(items).toEqual([
    {
      friendName: 'Bia',
      totalAmount: 2001,
      nextPayment: 2001,
      isInstallment: false,
      perInstallAmount: 2001,
      totalInstallments: 0,
      paidInstallments: 0,
      nextPaymentDate: '2026-06-10',
    },
    {
      friendName: 'Caio',
      totalAmount: 1000,
      nextPayment: 333,
      isInstallment: true,
      perInstallAmount: 333,
      totalInstallments: 3,
      paidInstallments: 1,
      // Weekly: the anchor 2026-02-01 plus one week.
      nextPaymentDate: '2026-02-08T00:00:00Z',
    },
  ])
})

it('an installment whose date does not parse has no next payment date', async () => {
  const repo = fakePeerDebtRepo({
    getActiveUserDebtsWithFriend: async (): Promise<ActiveUserDebt[]> => [
      {
        friendName: 'Dani',
        amount: -900,
        isInstallment: true,
        totalInstallments: 3,
        paidInstallments: 0,
        frequency: 'monthly',
        date: '2026-09-11 20:01:19',
        anchorDate: null,
      },
    ],
  })
  const items = await new PeerDebtService(repo).getFriendDebtBreakdown(null)
  expect(items[0]?.nextPayment).toBe(300)
  expect(items[0]?.nextPaymentDate).toBeNull()
})

it('createDebt assigns a new id and passes the row to the repo', async () => {
  let inserted: PeerDebt | undefined
  const repo = fakePeerDebtRepo({
    insert: async (d) => {
      inserted = d
    },
  })
  const created = await new PeerDebtService(repo).createDebt({
    accountId: crypto.randomUUID(),
    friendId: crypto.randomUUID(),
    amount: -500,
    description: 'coffee',
    date: '2026-06-10',
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    frequency: null,
    anchorDate: null,
    isConfirmed: false,
  })
  expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(inserted).toEqual(created)
})
