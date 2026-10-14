// Port of internal/handler/peer_debt.go (routes under /api/peer-debts).
//
// Money: the request amount is in CENTS (Go: int64(math.Round(req.Amount)), no *100), unlike most
// routes. The response amount is dollars (cents / 100), so a created debt echoes its amount in dollars.
// Errors (Go's echo.NewHTTPError calls):
// - a bad id, a missing or bad account_id, a bad friend_id on list: 400 with the route's text;
// - create: an installment without a positive total: 400; a bad friend_id, then a bad account_id: 400;
// - a repo ErrNoRows: 404 "peer debt not found" (Update, Delete, Confirm, ConfirmToggle);
// - a service error: 500 with the error text.
// Lists: the Go handler builds every list with make(), so an empty list is [] (never null).

import type { App } from '../app'
import { HttpError, route } from '../http'
import { goRound } from '../num'
import type { PeerDebt } from '../repo/peerDebt'
import type { NewPeerDebt, PeerDebtService } from '../service/peerDebt'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'
import { notFoundOr500, parseIdOr400, queryAccountId, rethrow500 } from './common'

/** The service methods the handlers use (Go: PeerDebtServiceIface, so tests can inject fakes). */
export type PeerDebtServiceIface = Pick<
  PeerDebtService,
  | 'listByFriend'
  | 'listAll'
  | 'createDebt'
  | 'updateDebt'
  | 'deleteDebt'
  | 'confirmInstallment'
  | 'toggleInstallmentConfirmation'
>

/** JSON shape of a peer debt (Go: PeerDebtResponse). Amount is dollars. */
export interface PeerDebtResponse {
  id: string
  account_id: string
  friend_id: string
  amount: number
  description: string
  date: string
  is_installment: boolean
  total_installments: number | null
  paid_installments: number
  frequency: string | null
  anchor_date: string | null
  is_confirmed: boolean
}

const CREATE_SCHEMA = {
  account_id: 'string',
  friend_id: 'string',
  amount: 'float',
  description: 'string',
  date: 'string',
  is_installment: 'bool',
  total_installments: 'intPtr',
  frequency: 'stringPtr',
  anchor_date: 'stringPtr',
} as const

const CREATE_FIELDS: FieldSpec[] = [
  { goName: 'AccountID', jsonName: 'account_id', rules: 'required' },
  { goName: 'FriendID', jsonName: 'friend_id', rules: 'required' },
  { goName: 'Amount', jsonName: 'amount', rules: 'required' },
  { goName: 'Description', jsonName: 'description', rules: 'required' },
  { goName: 'Date', jsonName: 'date', rules: 'required' },
]

const PATCH_SCHEMA = {
  amount: 'floatPtr',
  description: 'stringPtr',
} as const

/** Go peerDebtToResponse: the amount is cents / 100. */
export function toPeerDebtResponse(d: PeerDebt): PeerDebtResponse {
  return {
    id: d.id,
    account_id: d.accountId,
    friend_id: d.friendId,
    amount: d.amount / 100,
    description: d.description,
    date: d.date,
    is_installment: d.isInstallment,
    total_installments: d.totalInstallments,
    paid_installments: d.paidInstallments,
    frequency: d.frequency,
    anchor_date: d.anchorDate,
    is_confirmed: d.isConfirmed,
  }
}

const NOT_FOUND = 'peer debt not found'
const INVALID_ID = 'invalid peer debt id'

export function registerPeerDebtRoutes(app: App, svc: PeerDebtServiceIface = app.peerDebtSvc): void {
  route('GET', '/api/peer-debts', async ({ query }) => {
    const accountId = queryAccountId(query)
    // The optional friend_id narrows the list to one friend; an empty value is no filter.
    const friendRaw = query.get('friend_id') ?? ''
    if (friendRaw !== '') {
      const friendId = parseIdOr400(friendRaw, 'invalid friend_id')
      const debts = await svc.listByFriend(friendId, accountId).catch(rethrow500)
      return { body: debts.map(toPeerDebtResponse) }
    }
    const debts = await svc.listAll(accountId).catch(rethrow500)
    return { body: debts.map(toPeerDebtResponse) }
  })

  route('POST', '/api/peer-debts', async ({ body }) => {
    const req = bindBody(body, CREATE_SCHEMA)
    validateOrThrow('CreatePeerDebtRequest', req, CREATE_FIELDS)
    if (req.is_installment && (req.total_installments === null || req.total_installments <= 0)) {
      throw new HttpError(400, 'total_installments must be a positive integer when is_installment is true')
    }
    const friendId = parseIdOr400(req.friend_id, 'invalid friend_id')
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    const d: NewPeerDebt = {
      accountId,
      friendId,
      amount: goRound(req.amount),
      description: req.description,
      date: req.date,
      isInstallment: req.is_installment,
      totalInstallments: req.total_installments,
      paidInstallments: 0,
      frequency: req.frequency,
      anchorDate: req.anchor_date,
      isConfirmed: false,
    }
    const created = await svc.createDebt(d).catch(rethrow500)
    return { status: 201, body: toPeerDebtResponse(created) }
  })

  route('PATCH', '/api/peer-debts/:id', async ({ params, body }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    const req = bindBody(body, PATCH_SCHEMA)
    // The amount is in cents here too (no *100). A null pointer field is nil: no change.
    const amount = req.amount === null ? undefined : goRound(req.amount)
    await svc.updateDebt(id, amount, req.description ?? undefined).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })

  route('DELETE', '/api/peer-debts/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    await svc.deleteDebt(id).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })

  route('POST', '/api/peer-debts/:id/confirm', async ({ params }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    await svc.confirmInstallment(id).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })

  route('POST', '/api/peer-debts/:id/confirm-toggle', async ({ params }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    await svc.toggleInstallmentConfirmation(id).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })
}
