// @vitest-environment node
// The Go friend service has no test file; these cover the public friend view (Go GetPublicFriendView)
// with the fakes of testing/fakesPeerGroup.ts, and the create path.
import { expect, it } from 'vitest'
import type { Friend } from '../repo/friend'
import type { GroupEvent, GroupEventParticipant } from '../repo/groupEvent'
import type { PeerDebt } from '../repo/peerDebt'
import type { ProfileRepo, UserProfile } from '../repo/profile'
import { fakeFriendRepo, fakeGroupEventRepo, fakePeerDebtRepo } from '../testing/fakesPeerGroup'
import { FriendService } from './friend'
import { GroupEventService } from './groupEvent'
import { PeerDebtService } from './peerDebt'
import { ProfileService } from './profile'

function profileRepoWith(p: UserProfile): ProfileRepo {
  return {
    getByAccount: async () => p,
    upsertByAccount: async () => undefined,
  }
}

it('createFriend assigns an id and a 32-hex public token and stores notes and pix key as given', async () => {
  let inserted: Friend | undefined
  const repo = fakeFriendRepo({
    insert: async (f) => {
      inserted = f
    },
  })
  const created = await new FriendService(repo).createFriend('Ana', 'note', null)
  expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(created.publicToken).toMatch(/^[0-9a-f]{32}$/)
  expect(created).toEqual({ id: created.id, name: 'Ana', publicToken: created.publicToken, notes: 'note', pixKey: null })
  expect(inserted).toEqual(created)
})

it('getPublicFriendView fails until its dependencies are configured (Go never configures them in production)', async () => {
  const svc = new FriendService(fakeFriendRepo())
  await expect(svc.getPublicFriendView('tok')).rejects.toThrow(
    'service.GetPublicFriendView: dependencies not configured',
  )
})

it('getPublicFriendView: the host sees the hosted group; a blank friend name reads as "Participant"', async () => {
  const accountId = crypto.randomUUID()
  const ana: Friend = { id: crypto.randomUUID(), name: 'Ana', publicToken: 'tok-ana', notes: null, pixKey: 'ana-pix' }
  const bia: Friend = { id: crypto.randomUUID(), name: '  ', publicToken: 'tok-bia', notes: null, pixKey: null }
  const friends = new Map([
    [ana.id, ana],
    [bia.id, bia],
  ])
  const friendRepo = fakeFriendRepo({
    getByToken: async (token) => {
      const f = [...friends.values()].find((x) => x.publicToken === token)
      if (f === undefined) throw new Error('no rows')
      return f
    },
    getById: async (id) => {
      const f = friends.get(id)
      if (f === undefined) throw new Error('no rows')
      return f
    },
  })
  const event: GroupEvent = {
    id: crypto.randomUUID(),
    accountId,
    title: 'pizza',
    date: '2026-06-10',
    totalAmount: 3000,
    publicToken: 'ev',
    notes: null,
    hostFriendId: ana.id,
  }
  const parts: GroupEventParticipant[] = [
    { eventId: event.id, friendId: null, shareAmount: 1000, isConfirmed: false },
    { eventId: event.id, friendId: ana.id, shareAmount: 1000, isConfirmed: false },
    { eventId: event.id, friendId: bia.id, shareAmount: 1000, isConfirmed: true },
  ]
  const groupSvc = new GroupEventService(
    fakeGroupEventRepo({
      getByFriend: async () => [event],
      getParticipants: async () => parts,
    }),
    fakeFriendRepo(),
  )
  const debt: PeerDebt = {
    id: crypto.randomUUID(),
    accountId,
    friendId: ana.id,
    amount: -500,
    description: 'x',
    date: '2026-06-10',
    isInstallment: false,
    totalInstallments: null,
    paidInstallments: 0,
    frequency: null,
    anchorDate: null,
    isConfirmed: false,
  }
  const peerSvc = new PeerDebtService(
    fakePeerDebtRepo({
      getByFriend: async () => [debt],
      getBalanceByFriend: async () => ({ friendOwesUser: 0, userOwesFriend: 500, net: -500 }),
    }),
  )

  const svc = new FriendService(friendRepo)
  svc.configurePublicViewDependencies(
    peerSvc,
    groupSvc,
    new ProfileService(profileRepoWith({ accountId, displayName: 'Bruno', pixKey: 'owner-pix', theme: 'neutral-command' })),
  )

  const view = await svc.getPublicFriendView('tok-ana')
  expect(view.name).toBe('Ana')
  expect(view.balance).toEqual({ friendOwesUser: 0, userOwesFriend: 500, net: -500 })
  expect(view.debts).toEqual([debt])
  expect(view.groups).toEqual([
    {
      eventId: event.id,
      title: 'pizza',
      date: '2026-06-10',
      shareAmount: 10,
      isConfirmed: false,
      hostName: 'Ana',
      hostPixKey: 'ana-pix',
      viewerIsHost: true,
    },
  ])
  expect(view.hostedGroups).toEqual([
    {
      eventId: event.id,
      title: 'pizza',
      date: '2026-06-10',
      participants: [{ friendId: bia.id, friendName: 'Participant', shareAmount: 10, isConfirmed: true }],
    },
  ])
})

it('getPublicFriendView: an event with no friend host shows the account owner, or "Host" for a blank name', async () => {
  const accountId = crypto.randomUUID()
  const ana: Friend = { id: crypto.randomUUID(), name: 'Ana', publicToken: 'tok-ana', notes: null, pixKey: null }
  const friendRepo = fakeFriendRepo({
    getByToken: async () => ana,
  })
  const event: GroupEvent = {
    id: crypto.randomUUID(),
    accountId,
    title: 'lunch',
    date: '2026-06-11',
    totalAmount: 1000,
    publicToken: 'ev2',
    notes: null,
    hostFriendId: null,
  }
  const groupSvc = new GroupEventService(
    fakeGroupEventRepo({
      getByFriend: async () => [event],
      getParticipants: async () => [{ eventId: event.id, friendId: ana.id, shareAmount: 250, isConfirmed: false }],
    }),
    fakeFriendRepo(),
  )
  const svc = new FriendService(friendRepo)
  svc.configurePublicViewDependencies(
    new PeerDebtService(fakePeerDebtRepo()),
    groupSvc,
    new ProfileService(profileRepoWith({ accountId, displayName: '   ', pixKey: 'x', theme: 'neutral-command' })),
  )
  const view = await svc.getPublicFriendView('tok-ana')
  expect(view.groups).toEqual([
    {
      eventId: event.id,
      title: 'lunch',
      date: '2026-06-11',
      shareAmount: 2.5,
      isConfirmed: false,
      hostName: 'Host',
      hostPixKey: null,
      viewerIsHost: false,
    },
  ])
  expect(view.hostedGroups).toEqual([])
})
