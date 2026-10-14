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

describe('bindBody boolPtr (Go *bool)', () => {
  const BOOL_SCHEMA = { is_installment: 'boolPtr' } as const

  it.each([
    ['an absent field is nil', {}, null],
    ['a null field is nil', { is_installment: null }, null],
    ['true is kept', { is_installment: true }, true],
    ['false is a value, not nil', { is_installment: false }, false],
  ])('%s', (_name, body, expected) => {
    expect(bindBody(body, BOOL_SCHEMA).is_installment).toBe(expected)
  })

  it.each([
    ['a string', { is_installment: 'true' }],
    ['a number', { is_installment: 1 }],
  ])('rejects %s with 400', (_name, body) => {
    let caught: unknown
    try {
      bindBody(body, BOOL_SCHEMA)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(HttpError)
    expect((caught as HttpError).status).toBe(400)
  })
})

// The array kind: a Go slice of structs. A missing or null value is a nil slice (null); [] is a
// non-nil empty slice; any other JSON type is a bind error.
describe('bindBody array (Go slice of structs)', () => {
  const ARRAY_SCHEMA = { participants: 'array' } as const

  it('returns the raw array, [] stays a non-nil empty array', () => {
    expect(bindBody({ participants: [{ a: 1 }] }, ARRAY_SCHEMA).participants).toEqual([{ a: 1 }])
    expect(bindBody({ participants: [] }, ARRAY_SCHEMA).participants).toEqual([])
  })

  it('a missing or null array is null (nil slice)', () => {
    expect(bindBody({}, ARRAY_SCHEMA).participants).toBeNull()
    expect(bindBody({ participants: null }, ARRAY_SCHEMA).participants).toBeNull()
    expect(bindBody(undefined, ARRAY_SCHEMA).participants).toBeNull()
  })

  it.each([['"x"'], [1], [true], [{}]])('a non-array value %s is a 400', (value) => {
    let caught: unknown
    try {
      bindBody({ participants: value }, ARRAY_SCHEMA)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(HttpError)
    expect((caught as HttpError).status).toBe(400)
  })
})
