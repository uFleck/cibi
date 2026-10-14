// @vitest-environment node
// Tests for the Go pointer-to-int field kind (*int) added for the pay schedule handlers.
import { describe, expect, it } from 'vitest'
import { HttpError } from '../http'
import { bindBody } from './bind'

const SCHEMA = { day_of_month_2: 'intPtr' } as const

describe('bindBody intPtr (Go *int)', () => {
  it.each([
    ['an absent field is nil', {}, null],
    ['a null field is nil', { day_of_month_2: null }, null],
    ['an integer is kept', { day_of_month_2: 15 }, 15],
    ['zero is a value, not nil', { day_of_month_2: 0 }, 0],
  ])('%s', (_name, body, expected) => {
    expect(bindBody(body, SCHEMA).day_of_month_2).toBe(expected)
  })

  it.each([
    ['a string', { day_of_month_2: '15' }],
    ['a fraction', { day_of_month_2: 15.5 }],
    ['a boolean', { day_of_month_2: true }],
  ])('rejects %s with 400', (_name, body) => {
    let caught: unknown
    try {
      bindBody(body, SCHEMA)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(HttpError)
    expect((caught as HttpError).status).toBe(400)
  })
})
