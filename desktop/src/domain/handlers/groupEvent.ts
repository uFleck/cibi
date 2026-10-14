// Port of internal/handler/group_event.go (routes under /api/group-events).
//
// Money: an event's total_amount and a participant's share_amount are dollars in and out (dollars *100
// with goRound in, cents / 100 out). An event transaction's amount is raw cents in and out (no
// conversion, as Go).
// Dates: an event's date is stored as given. A transaction's created_at is RFC3339 in UTC with whole
// seconds (Go t.UTC().Format(time.RFC3339)).
// Errors (Go's echo.NewHTTPError calls):
// - a bad id, a bad account_id, a bad friend_id in participants, a bad host_friend_id: 400 with the route's text;
// - a repo ErrNoRows: 404 "group event not found" (GetByID, Update, Delete, SetParticipants);
// - a service error: 500 with the error text. Transaction routes never map ErrNoRows.
// Lists: the Go handler builds every list with make(), so an empty list is [] (never null).
// Participants: the key is omitted when there are none (Go omitempty on a slice).

import type { App } from '../app'
import { route } from '../http'
import { goRound } from '../num'
import { formatDbTime } from '../dates'
import type { GroupEvent, GroupEventParticipant, GroupEventTransaction } from '../repo/groupEvent'
import type { GroupEventService } from '../service/groupEvent'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'
import { notFoundOr500, parseIdOr400, queryAccountId, rethrow500 } from './common'

/** The service methods the handlers use (Go: GroupEventServiceIface, so tests can inject fakes). */
export type GroupEventServiceIface = Pick<
  GroupEventService,
  | 'listEvents'
  | 'createEvent'
  | 'getEventById'
  | 'updateEvent'
  | 'deleteEvent'
  | 'setParticipants'
  | 'getParticipants'
  | 'addEventTransaction'
  | 'removeEventTransaction'
  | 'getEventTransactions'
>

/** JSON shape of one participant (Go: ParticipantResponse). Share is dollars; friend_id null = the owner. */
export interface ParticipantResponse {
  friend_id: string | null
  share_amount: number
  is_confirmed: boolean
}

/** JSON shape of a group event (Go: GroupEventResponse). total_amount is dollars. */
export interface GroupEventResponse {
  id: string
  account_id: string
  title: string
  date: string
  total_amount: number
  public_token: string
  notes: string | null
  host_friend_id: string | null
  /** Present only when the event has participants (Go omitempty). */
  participants?: ParticipantResponse[]
}

/** JSON shape of an event transaction (Go: GroupEventTransactionResponse). amount is cents. */
export interface GroupEventTransactionResponse {
  id: string
  event_id: string
  description: string
  amount: number
  created_at: string
}

const CREATE_SCHEMA = {
  account_id: 'string',
  title: 'string',
  date: 'string',
  total_amount: 'float',
  notes: 'stringPtr',
} as const

const CREATE_FIELDS: FieldSpec[] = [
  { goName: 'AccountID', jsonName: 'account_id', rules: 'required' },
  { goName: 'Title', jsonName: 'title', rules: 'required' },
  { goName: 'Date', jsonName: 'date', rules: 'required' },
  { goName: 'TotalAmount', jsonName: 'total_amount', rules: 'required' },
]

const PATCH_SCHEMA = {
  title: 'stringPtr',
  date: 'stringPtr',
  total_amount: 'floatPtr',
  notes: 'stringPtr',
} as const

const ADD_TRANSACTION_SCHEMA = {
  description: 'string',
  amount: 'int',
} as const

const ADD_TRANSACTION_FIELDS: FieldSpec[] = [
  { goName: 'Description', jsonName: 'description', rules: 'required' },
  { goName: 'Amount', jsonName: 'amount', rules: 'required' },
]

const SET_PARTICIPANTS_SCHEMA = {
  participants: 'array',
  host_friend_id: 'stringPtr',
} as const

const SET_PARTICIPANTS_FIELDS: FieldSpec[] = [
  { goName: 'Participants', jsonName: 'participants', rules: 'required' },
]

const PARTICIPANT_SCHEMA = {
  friend_id: 'stringPtr',
  share_amount: 'float',
  is_confirmed: 'bool',
} as const

/** Go groupEventToResponse. participants is null when the handler passes none (the list and create routes). */
export function toGroupEventResponse(
  e: GroupEvent,
  participants: GroupEventParticipant[] | null = null,
): GroupEventResponse {
  const response: GroupEventResponse = {
    id: e.id,
    account_id: e.accountId,
    title: e.title,
    date: e.date,
    total_amount: e.totalAmount / 100,
    public_token: e.publicToken,
    notes: e.notes,
    host_friend_id: e.hostFriendId,
  }
  if (participants !== null && participants.length > 0) {
    response.participants = participants.map((p) => ({
      friend_id: p.friendId,
      share_amount: p.shareAmount / 100,
      is_confirmed: p.isConfirmed,
    }))
  }
  return response
}

/** Go toGroupEventTxnResponse: created_at is RFC3339 UTC, whole seconds. */
export function toGroupEventTxnResponse(t: GroupEventTransaction): GroupEventTransactionResponse {
  return {
    id: t.id,
    event_id: t.eventId,
    description: t.description,
    amount: t.amount,
    created_at: formatDbTime(t.createdAt),
  }
}

const NOT_FOUND = 'group event not found'
const INVALID_ID = 'invalid group event id'

export function registerGroupEventRoutes(app: App, svc: GroupEventServiceIface = app.groupEventSvc): void {
  route('GET', '/api/group-events', async ({ query }) => {
    const accountId = queryAccountId(query)
    const events = await svc.listEvents(accountId).catch(rethrow500)
    return { body: events.map((e) => toGroupEventResponse(e)) }
  })

  route('POST', '/api/group-events', async ({ body }) => {
    const req = bindBody(body, CREATE_SCHEMA)
    validateOrThrow('CreateGroupEventRequest', req, CREATE_FIELDS)
    const accountId = parseIdOr400(req.account_id, 'invalid account_id')
    const event = await svc
      .createEvent(accountId, req.title, req.date, goRound(req.total_amount * 100), req.notes)
      .catch(rethrow500)
    return { status: 201, body: toGroupEventResponse(event) }
  })

  route('GET', '/api/group-events/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    const event = await svc.getEventById(id).catch(notFoundOr500(NOT_FOUND))
    const participants = await svc.getParticipants(id).catch(rethrow500)
    return { body: toGroupEventResponse(event, participants) }
  })

  route('PATCH', '/api/group-events/:id', async ({ params, body }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    const req = bindBody(body, PATCH_SCHEMA)
    // A null pointer field is nil in Go: no change. The total is dollars, converted to cents.
    const totalAmount = req.total_amount === null ? undefined : goRound(req.total_amount * 100)
    await svc
      .updateEvent(id, req.title ?? undefined, req.date ?? undefined, totalAmount, req.notes ?? undefined)
      .catch(notFoundOr500(NOT_FOUND))
    const event = await svc.getEventById(id).catch(notFoundOr500(NOT_FOUND))
    return { body: toGroupEventResponse(event) }
  })

  route('DELETE', '/api/group-events/:id', async ({ params }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    await svc.deleteEvent(id).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })

  route('PUT', '/api/group-events/:id/participants', async ({ params, body }) => {
    const id = parseIdOr400(params.id, INVALID_ID)
    const req = bindBody(body, SET_PARTICIPANTS_SCHEMA)
    // Go decodes every element before it validates, so an element of the wrong type is a bind error.
    const elements = (req.participants ?? []).map((el) => bindBody(el, PARTICIPANT_SCHEMA))
    validateOrThrow('SetParticipantsRequest', req, SET_PARTICIPANTS_FIELDS)

    const participants: GroupEventParticipant[] = elements.map((p) => ({
      eventId: id,
      friendId: p.friend_id === null ? null : parseIdOr400(p.friend_id, 'invalid friend_id in participants'),
      shareAmount: goRound(p.share_amount * 100),
      isConfirmed: p.is_confirmed,
    }))
    // An empty host_friend_id is no host (the owner), as Go checks != "".
    const hostFriendId =
      req.host_friend_id === null || req.host_friend_id === ''
        ? null
        : parseIdOr400(req.host_friend_id, 'invalid host_friend_id')

    await svc.setParticipants(id, participants, hostFriendId).catch(notFoundOr500(NOT_FOUND))
    return { status: 204 }
  })

  route('POST', '/api/group-events/:id/transactions', async ({ params, body }) => {
    const eventId = parseIdOr400(params.id, 'invalid event id')
    const req = bindBody(body, ADD_TRANSACTION_SCHEMA)
    validateOrThrow('AddTransactionRequest', req, ADD_TRANSACTION_FIELDS)
    const t = await svc.addEventTransaction(eventId, req.description, req.amount).catch(rethrow500)
    return { status: 201, body: toGroupEventTxnResponse(t) }
  })

  route('DELETE', '/api/group-events/:id/transactions/:tid', async ({ params }) => {
    const id = parseIdOr400(params.tid, 'invalid transaction id')
    await svc.removeEventTransaction(id).catch(rethrow500)
    return { status: 204 }
  })

  route('GET', '/api/group-events/:id/transactions', async ({ params }) => {
    const eventId = parseIdOr400(params.id, 'invalid event id')
    const txns = await svc.getEventTransactions(eventId).catch(rethrow500)
    return { body: txns.map(toGroupEventTxnResponse) }
  })
}
