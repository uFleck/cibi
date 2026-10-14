// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb, setDb } from './db'
import { HttpError, localFetch, resetRoutesForTests, route } from './http'
import { createTestDb } from './testing/testDb'

const PAY_MESSAGE =
  'You need to set up your pay schedule before using Can I Buy It. Use POST /api/pay-schedule to configure.'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let db: Awaited<ReturnType<typeof createTestDb>>

beforeEach(async () => {
  resetRoutesForTests()
  db = await createTestDb()
  setDb(db)
})

afterEach(() => {
  resetRoutesForTests()
  db.close()
})

describe('params, query and body', () => {
  it('decodes path params and passes query params', async () => {
    route('GET', '/api/accounts/:id', async (ctx) => ({
      body: { id: ctx.params.id, q: ctx.query.get('account_id') },
    }))
    const res = await localFetch('/api/accounts/abc%20def?account_id=42')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ id: 'abc def', q: '42' })
  })

  it('parses a JSON body and passes it to the handler', async () => {
    route('POST', '/api/check', async (ctx) => ({ body: ctx.body }))
    const res = await localFetch('/api/check', {
      method: 'POST',
      body: JSON.stringify({ amount: 12.5, account_id: null }),
    })
    expect(await res.json()).toEqual({ amount: 12.5, account_id: null })
  })

  it('upper-cases the method', async () => {
    route('POST', '/api/x', async () => ({ body: 'ok' }))
    const res = await localFetch('/api/x', { method: 'post' })
    expect(res.status).toBe(200)
    expect(await res.json()).toBe('ok')
  })

  it('gives undefined as the body when the request has none', async () => {
    route('GET', '/api/x', async (ctx) => ({ body: { hasBody: ctx.body !== undefined } }))
    expect(await (await localFetch('/api/x')).json()).toEqual({ hasBody: false })
  })

  it('answers malformed JSON with 400 and does not run the handler', async () => {
    let ran = false
    route('POST', '/api/check', async () => {
      ran = true
      return { body: 'ran' }
    })
    const res = await localFetch('/api/check', { method: 'POST', body: '{bad json' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid request body' })
    expect(ran).toBe(false)
  })

  it('exposes the same database as getDb()', async () => {
    route('GET', '/api/db', async (ctx) => {
      const rows = await ctx.db.query<{ n: number }>('SELECT 1 AS n')
      return { body: { same: ctx.db === getDb(), n: rows[0]?.n } }
    })
    expect(await (await localFetch('/api/db')).json()).toEqual({ same: true, n: 1 })
  })
})

describe('matching', () => {
  it('a static segment beats a param, whatever the registration order', async () => {
    route('GET', '/api/accounts/:id', async (ctx) => ({ body: { via: 'param', id: ctx.params.id } }))
    route('GET', '/api/accounts/default', async () => ({ body: { via: 'static' } }))
    expect(await (await localFetch('/api/accounts/default')).json()).toEqual({ via: 'static' })
    expect(await (await localFetch('/api/accounts/xyz')).json()).toEqual({ via: 'param', id: 'xyz' })
  })

  it('/api/friends/summary and /breakdown beat /api/friends/:id', async () => {
    route('GET', '/api/friends/:id', async (ctx) => ({ body: { via: 'param', id: ctx.params.id } }))
    route('GET', '/api/friends/summary', async () => ({ body: { via: 'summary' } }))
    route('GET', '/api/friends/breakdown', async () => ({ body: { via: 'breakdown' } }))
    expect(await (await localFetch('/api/friends/summary')).json()).toEqual({ via: 'summary' })
    expect(await (await localFetch('/api/friends/breakdown')).json()).toEqual({ via: 'breakdown' })
    expect(await (await localFetch('/api/friends/7')).json()).toEqual({ via: 'param', id: '7' })
  })

  it('falls back to a param route when the static route has no handler for the method', async () => {
    route('POST', '/api/friends/summary', async () => ({ body: { via: 'summary-post' } }))
    route('GET', '/api/friends/:id', async (ctx) => ({ body: { via: 'param', id: ctx.params.id } }))
    expect(await (await localFetch('/api/friends/summary')).json()).toEqual({ via: 'param', id: 'summary' })
  })

  it('does not match a longer or shorter path, or an empty param (Echo: /api/accounts/ is 404)', async () => {
    route('GET', '/api/accounts/:id', async () => ({ body: 'x' }))
    route('POST', '/api/accounts/:id/set-default', async () => ({ body: 'x' }))
    // /api/accounts/:id has a route below it, so a longer path does not reach it (Echo).
    expect((await localFetch('/api/accounts/a/b')).status).toBe(404)
    expect((await localFetch('/api/accounts')).status).toBe(404)
    expect((await localFetch('/api/accounts/')).status).toBe(404)
  })

  it('a last param with no route below it takes the rest of the path, slashes included (Echo)', async () => {
    route('GET', '/api/friends/:id', async (ctx) => ({ body: ctx.params.id }))
    expect(await (await localFetch('/api/friends/a/b')).json()).toBe('a/b')
    expect(await (await localFetch('/api/friends/abc/')).json()).toBe('abc/')
    expect((await localFetch('/api/friends/')).status).toBe(404)
  })

  it('a tail param that takes the rest of the path still needs the static prefix to match', async () => {
    route('GET', '/api/x/:id', async (ctx) => ({ body: ctx.params.id }))
    expect((await localFetch('/api/y/a/b')).status).toBe(404)
  })

  it('decodes percent-encoded param segments (Echo: /api/accounts/a%20b gives id "a b")', async () => {
    route('GET', '/api/accounts/:id', async (ctx) => ({ body: ctx.params.id }))
    expect(await (await localFetch('/api/accounts/a%20b')).json()).toBe('a b')
  })

  it('answers an unknown path with 404 {"error":"Not Found"}', async () => {
    route('GET', '/api/accounts', async () => ({ body: [] }))
    const res = await localFetch('/nonexistent')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not Found' })
  })

  it('answers a known path with another method with 405 {"error":"Method Not Allowed"}', async () => {
    route('GET', '/api/accounts/:id', async () => ({ body: {} }))
    const res = await localFetch('/api/accounts/1', { method: 'DELETE' })
    expect(res.status).toBe(405)
    expect(await res.json()).toEqual({ error: 'Method Not Allowed' })
  })

  it('a repeated method and pattern replaces the earlier handler', async () => {
    route('GET', '/api/x', async () => ({ body: 'first' }))
    route('GET', '/api/x', async () => ({ body: 'second' }))
    expect(await (await localFetch('/api/x')).json()).toBe('second')
  })

  it('resetRoutesForTests removes every route', async () => {
    route('GET', '/api/x', async () => ({ body: 'x' }))
    resetRoutesForTests()
    expect((await localFetch('/api/x')).status).toBe(404)
  })

  it('rejects a pattern that does not start with a slash', () => {
    expect(() => route('GET', 'api/x', async () => ({ body: 'x' }))).toThrow("must start with '/'")
  })
})

describe('results', () => {
  it('uses status 200 by default and the given status otherwise', async () => {
    route('POST', '/api/created', async () => ({ status: 201, body: { id: 1 } }))
    const res = await localFetch('/api/created', { method: 'POST' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 1 })
  })

  it('sends status 204 without a body', async () => {
    route('DELETE', '/api/x/:id', async () => ({ status: 204, body: { ignored: true } }))
    const res = await localFetch('/api/x/1', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
    expect(await res.text()).toBe('')
  })

  it('sends an empty body when the result has no body', async () => {
    route('PATCH', '/api/x/:id', async () => undefined)
    const res = await localFetch('/api/x/1', { method: 'PATCH' })
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
    expect(await res.text()).toBe('')
  })
})

describe('errors', () => {
  it('an HttpError gives its status and {"error": message}', async () => {
    route('GET', '/api/x', async () => {
      throw new HttpError(422, 'invalid')
    })
    const res = await localFetch('/api/x')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'invalid' })
  })

  it('an HttpError with a code adds "code"', async () => {
    route('GET', '/api/x', async () => {
      throw new HttpError(409, 'already exists', 'DUPLICATE')
    })
    const res = await localFetch('/api/x')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already exists', code: 'DUPLICATE' })
  })

  it('an error that is not an HttpError gives 500 and hides its message', async () => {
    route('GET', '/api/x', async () => {
      throw new Error('disk on fire')
    })
    const res = await localFetch('/api/x')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal server error' })
  })

  it('a handler that throws synchronously is handled the same way', async () => {
    route('GET', '/api/x', () => {
      throw new HttpError(404, 'gone')
    })
    const res = await localFetch('/api/x')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'gone' })
  })

  it('PAY_SCHEDULE_REQUIRED in a plain error gives 500 with the code and the fixed message', async () => {
    route('GET', '/api/check', async () => {
      throw new Error('engine.CanIBuyIt: PAY_SCHEDULE_REQUIRED')
    })
    const res = await localFetch('/api/check')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: PAY_MESSAGE, code: 'PAY_SCHEDULE_REQUIRED' })
  })

  it('PAY_SCHEDULE_REQUIRED in an HttpError keeps the HttpError status', async () => {
    route('GET', '/api/check', async () => {
      throw new HttpError(500, 'engine.CanIBuyIt: PAY_SCHEDULE_REQUIRED')
    })
    const res = await localFetch('/api/check')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: PAY_MESSAGE, code: 'PAY_SCHEDULE_REQUIRED' })

    route('GET', '/api/other', async () => {
      throw new HttpError(400, 'PAY_SCHEDULE_REQUIRED')
    })
    const other = await localFetch('/api/other')
    expect(other.status).toBe(400)
    expect(await other.json()).toEqual({ error: PAY_MESSAGE, code: 'PAY_SCHEDULE_REQUIRED' })
  })
})

describe('serialization', () => {
  it('overlapping requests run one after the other, in call order', async () => {
    const log: string[] = []
    route('POST', '/api/slow/:name', async (ctx) => {
      const name = ctx.params.name
      log.push(`${name} start`)
      await delay(20)
      log.push(`${name} end`)
      return { body: name }
    })

    const [a, b] = await Promise.all([
      localFetch('/api/slow/a', { method: 'POST' }),
      localFetch('/api/slow/b', { method: 'POST' }),
    ])
    expect(await a.json()).toBe('a')
    expect(await b.json()).toBe('b')
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end'])
  })

  it('a failing request does not block the next one', async () => {
    route('GET', '/api/fail', async () => {
      throw new Error('boom')
    })
    route('GET', '/api/ok', async () => ({ body: 'fine' }))
    const [failed, ok] = await Promise.all([localFetch('/api/fail'), localFetch('/api/ok')])
    expect(failed.status).toBe(500)
    expect(await ok.json()).toBe('fine')
  })
})
