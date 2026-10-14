import { describe, expect, it } from 'vitest'
import { AppError, ErrNoRows, isErr, wrap, wrapping } from './errors'

describe('wrap (Go fmt.Errorf with %w)', () => {
  it('prefixes the message and keeps the cause', () => {
    const inner = new AppError('boom')
    const outer = wrap('accounts.GetAll', inner)
    expect(outer.message).toBe('accounts.GetAll: boom')
    expect(outer.cause).toBe(inner)
    expect(outer).toBeInstanceOf(AppError)
  })

  it('uses String(err) for non-Error values', () => {
    expect(wrap('op', 'plain').message).toBe('op: plain')
  })

  it('matches the Go text for a wrapped sql.ErrNoRows', () => {
    expect(wrap('accounts.GetDefault', ErrNoRows).message).toBe(
      'accounts.GetDefault: sql: no rows in result set',
    )
  })
})

describe('isErr (Go errors.Is)', () => {
  it('is true for the sentinel itself', () => {
    expect(isErr(ErrNoRows, ErrNoRows)).toBe(true)
  })

  it('finds the sentinel through several wrapping layers', () => {
    const err = wrap('service.GetByID', wrap('accounts.GetByID', ErrNoRows))
    expect(isErr(err, ErrNoRows)).toBe(true)
  })

  it('compares by identity, not by message', () => {
    const lookalike = new AppError('sql: no rows in result set')
    expect(isErr(wrap('op', lookalike), ErrNoRows)).toBe(false)
  })

  it('is false when the chain does not contain the sentinel', () => {
    expect(isErr(wrap('op', new Error('other')), ErrNoRows)).toBe(false)
    expect(isErr('not an error', ErrNoRows)).toBe(false)
    expect(isErr(undefined, ErrNoRows)).toBe(false)
  })
})

describe('wrapping', () => {
  it('returns the value on success', async () => {
    await expect(wrapping('op', async () => 7)).resolves.toBe(7)
  })

  it('wraps a rejection the way wrap does', async () => {
    const cause = new Error('db down')
    const err = await wrapping('op', async () => {
      throw cause
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).message).toBe('op: db down')
    expect((err as AppError).cause).toBe(cause)
  })
})
