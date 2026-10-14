// Port of internal/handler/friend.go (routes under /api/friends).
//
// Money: the summary and breakdown responses are dollars (cents / 100). Friend requests carry no money.
// Errors (Go's echo.NewHTTPError calls):
// - a bad id, a missing or bad account_id: 400 with the route's text;
// - a repo ErrNoRows: 404 "friend not found" (GET by id, Update, Delete);
// - a service error: 500 with the error text (a foreign key failure on delete keeps Go's text, see errors.ts);
// - Create's validation errors are 400 with the validator text.
// Lists: the Go handler builds every list with make(), so an empty list is [] (never null).

import type { App } from '../app'
import { route } from '../http'
import type { Friend } from '../repo/friend'
import type { FriendDebtItem } from '../service/peerDebt'
import type { FriendService } from '../service/friend'
import type { GroupEventService } from '../service/groupEvent'
import type { PeerDebtService } from '../service/peerDebt'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'
import { notFoundOr500, parseIdOr400, queryAccountId, rethrow500 } from './common'

/** The friend service methods the handlers use (Go: FriendServiceIface, so tests can inject fakes). */
export type FriendServiceIface = Pick<
  FriendService,
  'listFriends' | 'createFriend' | 'getFriendById' | 'updateFriend' | 'deleteFriend'
>

/** The peer debt calls of the summary and breakdown (Go: PeerDebtSummaryIface). */
export type PeerDebtSummaryIface = Pick<PeerDebtService, 'getGlobalBalance' | 'sumNextUserPayment' | 'getFriendDebtBreakdown'>

/** The group event calls of the summary and breakdown (Go: GroupEventSummaryIface). */
export type GroupEventSummaryIface = Pick<GroupEventService, 'getAdminPendingExpenses' | 'getPendingBalanceForAdmin'>

/** JSON shape of a friend (Go: FriendResponse). */
export interface FriendResponse {
  id: string
  name: string
  public_token: string
  notes: string | null
  pix_key: string | null
}

/** JSON shape of the summary (Go: FriendSummaryResponse). All amounts are dollars. */
export interface FriendSummaryResponse {
  total_owed_to_user: number
  total_user_owes: number
  net: number
  next_user_payment: number
}

/** JSON shape of one breakdown item (Go: FriendDebtBreakdownItemResponse). Amounts are dollars. */
export interface FriendDebtBreakdownItemResponse {
  friend_name: string
  total_amount: number
  next_payment: number
  is_installment: boolean
  per_install_amount: number
  total_installments: number
  paid_installments: number
  next_payment_date: string | null
}

const CREATE_SCHEMA = {
  name: 'string',
  notes: 'stringPtr',
  pix_key: 'stringPtr',
} as const

const CREATE_FIELDS: FieldSpec[] = [{ goName: 'Name', jsonName: 'name', rules: 'required' }]

const PATCH_SCHEMA = {
  name: 'stringPtr',
  notes: 'stringPtr',
  pix_key: 'stringPtr',
} as const

/** Go friendToResponse. */
export function toFriendResponse(f: Friend): FriendResponse {
  return {
    id: f.id,
    name: f.name,
    public_token: f.publicToken,
    notes: f.notes,
    pix_key: f.pixKey,
  }
}

/** Go breakdown item conversion: the cents of FriendDebtItem become dollars. */
function toBreakdownResponse(item: FriendDebtItem): FriendDebtBreakdownItemResponse {
  return {
    friend_name: item.friendName,
    total_amount: item.totalAmount / 100,
    next_payment: item.nextPayment / 100,
    is_installment: item.isInstallment,
    per_install_amount: item.perInstallAmount / 100,
    total_installments: item.totalInstallments,
    paid_installments: item.paidInstallments,
    next_payment_date: item.nextPaymentDate,
  }
}

const NOT_FOUND = 'friend not found'
const INVALID_ID = 'invalid friend id'

export function registerFriendRoutes(
  app: App,
  svc: FriendServiceIface = app.friendSvc,
  peerDebtSvc: PeerDebtSummaryIface = app.peerDebtSvc,
  groupSvc: GroupEventSummaryIface = app.groupEventSvc,
): void {
  route('GET', '/api/friends', async () => {
    const friends = await svc.listFriends().catch(rethrow500)
    return { body: friends.map(toFriendResponse) }
  })

  route('POST', '/api/friends', async ({ body }) => {
    const req = bindBody(body, CREATE_SCHEMA)
    validateOrThrow('CreateFriendRequest', req, CREATE_FIELDS)
    const f = await svc.createFriend(req.name, req.notes, req.pix_key).catch(rethrow500)
    return { status: 201, body: toFriendResponse(f) }
  })

  // Registered for the same paths as Go; /summary and /breakdown are static, so they win over /:id.
  route('GET', '/api/friends/summary', async ({ query }) => {
    const accountId = queryAccountId(query)
    const bal = await peerDebtSvc.getGlobalBalance(accountId).catch(rethrow500)
    const nextPayment = await peerDebtSvc.sumNextUserPayment(accountId).catch(rethrow500)
    const groupBal = await groupSvc.getPendingBalanceForAdmin(accountId).catch(rethrow500)

    const totalOwedToUser = bal.totalOwedToUser + groupBal.theyOweAdmin
    const totalUserOwes = bal.totalUserOwes + groupBal.adminOwesHost
    const next = nextPayment + groupBal.adminOwesHost
    const net = totalOwedToUser - totalUserOwes

    const response: FriendSummaryResponse = {
      total_owed_to_user: totalOwedToUser / 100,
      total_user_owes: totalUserOwes / 100,
      net: net / 100,
      next_user_payment: next / 100,
    }
    return { body: response }
  })

  route('GET', '/api/friends/breakdown', async ({ query }) => {
    const accountId = queryAccountId(query)
    const items = await peerDebtSvc.getFriendDebtBreakdown(accountId).catch(rethrow500)
    const groupExpenses = await groupSvc.getAdminPendingExpenses(accountId).catch(rethrow500)

    // Group expenses the admin still owes come after the peer debts, each due on its stored date.
    const combined: FriendDebtItem[] = [...items]
    for (const ge of groupExpenses) {
      combined.push({
        friendName: ge.hostName,
        totalAmount: ge.shareAmount,
        nextPayment: ge.shareAmount,
        isInstallment: false,
        perInstallAmount: ge.shareAmount,
        totalInstallments: 1,
        paidInstallments: 0,
        nextPaymentDate: ge.date,
      })
    }
    return { body: combined.map(toBreakdownResponse) }
  })

  route('GET', '/api/friends/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    const f = await svc.getFriendById(id).catch(notFoundOr500(NOT_FOUND))
    return { body: toFriendResponse(f) }
  })

  route('PATCH', '/api/friends/:id', async ({ params, body }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    const req = bindBody(body, PATCH_SCHEMA)
    // A null pointer field is nil in Go: no change.
    await svc
      .updateFriend(id, req.name ?? undefined, req.notes ?? undefined, req.pix_key ?? undefined)
      .catch(notFoundOr500(NOT_FOUND))
    const f = await svc.getFriendById(id).catch(notFoundOr500(NOT_FOUND))
    return { body: toFriendResponse(f) }
  })

  route('DELETE', '/api/friends/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    await svc.deleteFriend(id).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })
}
