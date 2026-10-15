// Port of internal/service/friend.go.
//
// Ids are canonical UUID strings. Go's nil pointers (nil = no change on update, nil notes/pix key on
// create) are `undefined` or `null` as the repo types say. Go's nil slices come back as empty arrays
// here, so the handler must emit null where Go's JSON emits null (Go nil is an empty result).
//
// Go never calls ConfigurePublicViewDependencies outside the tests, so in production
// GetPublicFriendView fails with "dependencies not configured", as the Go server does.

import { AppError, wrapping } from '../errors'
import { goTrimSpace } from '../strings'
import type { Friend, FriendRepo } from '../repo/friend'
import type { GroupEvent, GroupEventParticipant } from '../repo/groupEvent'
import type { PeerDebt, PeerDebtBalance } from '../repo/peerDebt'
import type { UserProfile } from '../repo/profile'
import { generatePublicToken } from './token'

/** Go friendPublicPeerDebtSvc: the peer debt calls the public view needs. */
export interface FriendPublicPeerDebtSvc {
  getBalanceByFriend(friendId: string): Promise<PeerDebtBalance>
  listByFriend(friendId: string, accountId: string | null): Promise<PeerDebt[]>
}

/** Go friendPublicGroupSvc: the group event calls the public view needs. */
export interface FriendPublicGroupSvc {
  listEventsByFriend(friendId: string): Promise<GroupEvent[]>
  getParticipants(eventId: string): Promise<GroupEventParticipant[]>
}

/** Go friendPublicProfileSvc: the owner profile lookup. */
export interface FriendPublicProfileSvc {
  getByAccount(accountId: string): Promise<UserProfile>
}

/** Go PublicFriendGroupEventView: a group event the friend joined. Share is in dollars. */
export interface PublicFriendGroupEventView {
  eventId: string
  title: string
  date: string
  shareAmount: number
  isConfirmed: boolean
  hostName: string
  hostPixKey: string | null
  viewerIsHost: boolean
}

/** Go HostedGroupParticipantView. Share is in dollars. */
export interface HostedGroupParticipantView {
  friendId: string
  friendName: string
  shareAmount: number
  isConfirmed: boolean
}

/** Go HostedGroupView: an event the friend hosts. Empty participants: Go nil (JSON null). */
export interface HostedGroupView {
  eventId: string
  title: string
  date: string
  participants: HostedGroupParticipantView[]
}

/** Go PublicFriendView: everything the public friend endpoint shows. Empty debts: Go nil (JSON null). */
export interface PublicFriendView {
  name: string
  balance: PeerDebtBalance
  debts: PeerDebt[]
  groups: PublicFriendGroupEventView[]
  hostedGroups: HostedGroupView[]
}

const DEFAULT_HOST_NAME = 'Host'

export class FriendService {
  private readonly repo: FriendRepo
  private peerDebtSvc: FriendPublicPeerDebtSvc | undefined
  private groupSvc: FriendPublicGroupSvc | undefined
  private profileSvc: FriendPublicProfileSvc | undefined

  constructor(repo: FriendRepo) {
    this.repo = repo
  }

  /** Go ConfigurePublicViewDependencies: wires the collaborators used by getPublicFriendView. */
  configurePublicViewDependencies(
    peerDebtSvc: FriendPublicPeerDebtSvc,
    groupSvc: FriendPublicGroupSvc,
    profileSvc: FriendPublicProfileSvc,
  ): void {
    this.peerDebtSvc = peerDebtSvc
    this.groupSvc = groupSvc
    this.profileSvc = profileSvc
  }

  listFriends(): Promise<Friend[]> {
    return wrapping('service.ListFriends', () => this.repo.getAll())
  }

  /** Creates a friend with a new id and public token. Notes and pix key are stored as given. */
  async createFriend(name: string, notes: string | null, pixKey: string | null): Promise<Friend> {
    const f: Friend = {
      id: crypto.randomUUID(),
      name,
      publicToken: generatePublicToken(),
      notes,
      pixKey,
    }
    await wrapping('service.CreateFriend', () => this.repo.insert(f))
    return f
  }

  getFriendById(id: string): Promise<Friend> {
    return wrapping('service.GetFriendByID', () => this.repo.getById(id))
  }

  getFriendByToken(token: string): Promise<Friend> {
    return wrapping('service.GetFriendByToken', () => this.repo.getByToken(token))
  }

  /** Go ownerProfile: the account's profile name and PIX key, or "Host" with no PIX key. */
  private async ownerProfile(accountId: string): Promise<{ displayName: string; pixKey: string | null }> {
    const fallback = { displayName: DEFAULT_HOST_NAME, pixKey: null }
    if (this.profileSvc === undefined) return fallback
    try {
      const p = await this.profileSvc.getByAccount(accountId)
      if (goTrimSpace(p.displayName) === '') return fallback
      return { displayName: p.displayName, pixKey: p.pixKey }
    } catch {
      return fallback
    }
  }

  /** Go hostInfo: the host friend when the event has one with a name, else the account owner. */
  private async hostInfo(
    event: GroupEvent,
  ): Promise<{ hostName: string; hostPixKey: string | null; hostFriendId: string | null }> {
    if (event.hostFriendId !== null) {
      try {
        const f = await this.repo.getById(event.hostFriendId)
        if (goTrimSpace(f.name) !== '') {
          return { hostName: f.name, hostPixKey: f.pixKey, hostFriendId: event.hostFriendId }
        }
      } catch {
        // Not found or unreadable: the owner is the host, as in Go.
      }
    }
    const owner = await this.ownerProfile(event.accountId)
    return { hostName: owner.displayName, hostPixKey: owner.pixKey, hostFriendId: null }
  }

  /** Builds the public friend endpoint data for the friend with this token. */
  async getPublicFriendView(token: string): Promise<PublicFriendView> {
    const peerDebtSvc = this.peerDebtSvc
    const groupSvc = this.groupSvc
    if (peerDebtSvc === undefined || groupSvc === undefined) {
      throw new AppError('service.GetPublicFriendView: dependencies not configured')
    }

    const friend = await wrapping('service.GetPublicFriendView', () => this.repo.getByToken(token))
    const balance = await wrapping('service.GetPublicFriendView: get balance', () =>
      peerDebtSvc.getBalanceByFriend(friend.id),
    )
    const debts = await wrapping('service.GetPublicFriendView: list debts', () =>
      peerDebtSvc.listByFriend(friend.id, null),
    )
    const events = await wrapping('service.GetPublicFriendView: list events', () =>
      groupSvc.listEventsByFriend(friend.id),
    )

    const groups: PublicFriendGroupEventView[] = []
    const hostedGroups: HostedGroupView[] = []

    for (const e of events) {
      const host = await this.hostInfo(e)
      const parts = await wrapping('service.GetPublicFriendView: get participants', () =>
        groupSvc.getParticipants(e.id),
      )

      for (const p of parts) {
        if (p.friendId === null || p.friendId !== friend.id) continue
        groups.push({
          eventId: e.id,
          title: e.title,
          date: e.date,
          shareAmount: p.shareAmount / 100,
          isConfirmed: p.isConfirmed,
          hostName: host.hostName,
          hostPixKey: host.hostPixKey,
          viewerIsHost: host.hostFriendId !== null && host.hostFriendId === friend.id,
        })
        break
      }

      if (host.hostFriendId !== null && host.hostFriendId === friend.id) {
        const hg: HostedGroupView = { eventId: e.id, title: e.title, date: e.date, participants: [] }
        for (const p of parts) {
          if (p.friendId === null || p.friendId === friend.id) continue
          let name = 'Participant'
          try {
            const target = await this.repo.getById(p.friendId)
            if (goTrimSpace(target.name) !== '') name = target.name
          } catch {
            // Unknown or unreadable participant: shown as "Participant", as in Go.
          }
          hg.participants.push({
            friendId: p.friendId,
            friendName: name,
            shareAmount: p.shareAmount / 100,
            isConfirmed: p.isConfirmed,
          })
        }
        hostedGroups.push(hg)
      }
    }

    return {
      name: friend.name,
      balance,
      debts,
      groups,
      hostedGroups,
    }
  }

  /** Patches the given fields of a friend (undefined = no change). */
  updateFriend(id: string, name?: string, notes?: string, pixKey?: string): Promise<void> {
    return wrapping('service.UpdateFriend', () => this.repo.update(id, name, notes, pixKey))
  }

  /** Removes a friend. Rejects with ErrFriendInUse (nothing deleted) while peer debts or group events reference it. */
  deleteFriend(id: string): Promise<void> {
    return wrapping('service.DeleteFriend', () => this.repo.deleteById(id))
  }
}
