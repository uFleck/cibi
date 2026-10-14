// In-process router that stands in for the Go Echo server. The UI's apiFetch calls
// localFetch(path, init) and gets back a standard Response with the same status codes and
// JSON bodies the Go server produced. Behavior mirrors Echo v4.12 and
// internal/handler/errors.go (CustomHTTPErrorHandler); see the notes on each function.

import { getDb, serialize, type Db } from './db'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** An error with an HTTP status. The message is sent to the client as {"error": message}. */
export class HttpError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export interface RouteContext {
  /** Path parameters, already percent-decoded. */
  params: Record<string, string>
  query: URLSearchParams
  /** The parsed JSON body, or undefined when the request has no body. */
  body: unknown
  db: Db
}

export interface RouteResult {
  /** Defaults to 200. */
  status?: number
  /** Serialized as JSON. Undefined (or status 204) gives an empty response. */
  body?: unknown
}

export type Handler = (ctx: RouteContext) => Promise<RouteResult | void>

interface Segment {
  isParam: boolean
  /** The literal text for static segments, the parameter name (without ':') for params. */
  text: string
}

/** Per-route options for route(). The defaults are the ones every route has. */
export interface RouteOptions {
  /**
   * The handler ignores a body that does not parse (Go `_ = c.Bind(&req)`): malformed JSON reaches the
   * handler as an undefined body instead of a 400. Only the handler can tell what a body it cannot read means.
   */
  ignoreMalformedBody?: boolean
}

interface Route {
  method: Method
  pattern: string
  segments: Segment[]
  handler: Handler
  ignoreMalformedBody: boolean
}

const routes: Route[] = []

const PAY_SCHEDULE_REQUIRED = 'PAY_SCHEDULE_REQUIRED'
// The message CustomHTTPErrorHandler sends for PAY_SCHEDULE_REQUIRED (internal/handler/errors.go).
const PAY_SCHEDULE_MESSAGE =
  'You need to set up your pay schedule before using Can I Buy It. Use POST /api/pay-schedule to configure.'

// The body error the handlers would send for malformed JSON. See localFetch for the difference.
const INVALID_BODY = 'invalid request body'

function parsePattern(pattern: string): Segment[] {
  if (!pattern.startsWith('/')) {
    throw new Error(`route pattern must start with '/': ${pattern}`)
  }
  return pattern.split('/').map((part) => {
    if (!part.startsWith(':')) return { isParam: false, text: part }
    const name = part.slice(1)
    if (name === '') throw new Error(`route pattern has an unnamed parameter: ${pattern}`)
    return { isParam: true, text: name }
  })
}

/** Registers a handler for method + pattern, e.g. route('GET', '/api/accounts/:id', handler). A repeated method + pattern replaces the earlier handler, like Echo. */
export function route(method: Method, pattern: string, handler: Handler, options: RouteOptions = {}): void {
  const entry: Route = {
    method,
    pattern,
    segments: parsePattern(pattern),
    handler,
    ignoreMalformedBody: options.ignoreMalformedBody ?? false,
  }
  const existing = routes.findIndex((r) => r.method === method && r.pattern === pattern)
  if (existing === -1) {
    routes.push(entry)
  } else {
    routes[existing] = entry
  }
}

/** Clears the route table. For tests only. */
export function resetRoutesForTests(): void {
  routes.length = 0
}

function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Echo lets a route's last segment, when it is a param, take the rest of the path, slashes included
 * (/api/friends/:id matches /api/friends/a/b with id "a/b", and Go answers 400 for it). That holds only
 * when no other route continues below that param: /api/accounts/:id, which has /api/accounts/:id/set-default
 * below it, does not match /api/accounts/a/b.
 */
function takesRestOfPath(r: Route): boolean {
  const last = r.segments.length - 1
  const tail = r.segments[last]
  if (tail === undefined || !tail.isParam) return false
  return !routes.some((q) => {
    if (q === r || q.segments.length <= r.segments.length) return false
    const qTail = q.segments[last]
    if (qTail === undefined || !qTail.isParam) return false
    for (let j = 0; j < last; j++) {
      const a = r.segments[j]
      const b = q.segments[j]
      if (a === undefined || b === undefined || a.isParam !== b.isParam) return false
      if (!a.isParam && a.text !== b.text) return false
    }
    return true
  })
}

/**
 * Matches the raw path split on '/' (the leading empty part is included, as the pattern is
 * split the same way). A param must not be empty: Echo answers /api/accounts/ with 404.
 */
function matchRoute(r: Route, parts: string[]): Record<string, string> | undefined {
  const count = r.segments.length
  const swallow = parts.length > count && takesRestOfPath(r)
  if (!swallow && count !== parts.length) return undefined
  const params: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    const segment = r.segments[i]
    // The tail param takes every remaining part, joined back with '/'.
    const part = swallow && i === count - 1 ? parts.slice(i).join('/') : parts[i]
    if (segment === undefined || part === undefined) return undefined
    if (segment.isParam) {
      if (part === '') return undefined
      params[segment.text] = decodeParam(part)
    } else if (segment.text !== part) {
      return undefined
    }
  }
  return params
}

/** True when `a` should win over `b` for the same path: a static segment beats a param at the first position where they differ (Echo). */
function prefers(a: Route, b: Route): boolean {
  for (let i = 0; i < a.segments.length; i++) {
    const aSeg = a.segments[i]
    const bSeg = b.segments[i]
    if (aSeg === undefined || bSeg === undefined) return false
    if (aSeg.isParam !== bSeg.isParam) return !aSeg.isParam
  }
  return false
}

type Lookup =
  | { kind: 'found'; route: Route; params: Record<string, string> }
  | { kind: 'notFound' }
  | { kind: 'methodNotAllowed' }

/**
 * Finds the route for method + path. Like Echo's router, a path that matches only under
 * other methods gives 405, and a path that matches nothing gives 404. When several routes
 * match the method, the most static one wins (so backtracking to a param route happens
 * when the static route lacks the method).
 */
function lookup(method: Method, pathname: string): Lookup {
  const parts = pathname.split('/')
  let best: { route: Route; params: Record<string, string> } | undefined
  let pathMatched = false
  for (const r of routes) {
    const params = matchRoute(r, parts)
    if (params === undefined) continue
    pathMatched = true
    if (r.method !== method) continue
    if (best === undefined || prefers(r, best.route)) {
      best = { route: r, params }
    }
  }
  if (best !== undefined) return { kind: 'found', route: best.route, params: best.params }
  return { kind: pathMatched ? 'methodNotAllowed' : 'notFound' }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Converts a handler's result to a Response. Status 204 and an undefined body give an
 * empty body (the UI client treats 204 as "no content").
 */
function toResponse(result: RouteResult | void): Response {
  const value: RouteResult = result ? result : {}
  const status = value.status ?? 200
  const body = value.body
  if (status === 204 || body === undefined) {
    return new Response(null, { status })
  }
  return jsonResponse(status, body)
}

/**
 * Converts a thrown value to the error Response. Mirrors CustomHTTPErrorHandler:
 * an HttpError keeps its status and message, anything else becomes 500
 * "internal server error", and an error whose text contains PAY_SCHEDULE_REQUIRED gets
 * that code and message (the status is kept, so 500 for a plain error).
 */
function errorResponse(err: unknown): Response {
  let status = 500
  let message = 'internal server error'
  let code: string | undefined
  if (err instanceof HttpError) {
    status = err.status
    message = err.message
    code = err.code
  }
  const text = err instanceof Error ? err.message : String(err)
  if (text.includes(PAY_SCHEDULE_REQUIRED)) {
    code = PAY_SCHEDULE_REQUIRED
    message = PAY_SCHEDULE_MESSAGE
  }
  return jsonResponse(status, code ? { error: message, code } : { error: message })
}

/**
 * Runs the route for `path` and returns its Response. Same signature as fetch for the
 * subset the app uses: method and string body.
 *
 * Differences from the Go server:
 * - The body is parsed by JSON.parse before the handler runs. A malformed body gets
 *   400 {"error": "invalid request body"}. Echo's text ("code=400, message=Syntax error:
 *   offset=..., ...") is not reproduced. Content-Type is not checked.
 * - Path params are matched on the raw path and then percent-decoded per segment.
 * - Every handler runs inside serialize(), so requests run one at a time, in call order.
 */
export async function localFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, 'http://local')
  const method = (init.method ?? 'GET').toUpperCase() as Method

  const found = lookup(method, url.pathname)
  if (found.kind === 'notFound') return jsonResponse(404, { error: 'Not Found' })
  if (found.kind === 'methodNotAllowed') return jsonResponse(405, { error: 'Method Not Allowed' })

  let body: unknown
  const raw = init.body
  if (raw !== undefined && raw !== null && raw !== '') {
    if (typeof raw !== 'string') return jsonResponse(400, { error: INVALID_BODY })
    try {
      body = JSON.parse(raw)
    } catch {
      // A route that ignores a body it cannot read (route option) gets no body instead of the 400.
      if (!found.route.ignoreMalformedBody) return jsonResponse(400, { error: INVALID_BODY })
      body = undefined
    }
  }

  try {
    const result = await serialize(() =>
      found.route.handler({
        params: found.params,
        query: url.searchParams,
        body,
        db: getDb(),
      }),
    )
    return toResponse(result)
  } catch (err) {
    return errorResponse(err)
  }
}
