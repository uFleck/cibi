import { describe, expect, it } from 'vitest'
import { goFloatText, goRound } from './num'

describe('goRound (Go math.Round: half away from zero)', () => {
  it.each([
    ['2.5 rounds up to 3', 2.5, 3],
    ['-2.5 rounds away from zero to -3', -2.5, -3],
    ['0.5 rounds up to 1', 0.5, 1],
    ['-0.5 rounds away from zero to -1', -0.5, -1],
    ['1.4 rounds down to 1', 1.4, 1],
    ['-1.6 rounds to -2', -1.6, -2],
    ['an integer is unchanged', 42, 42],
    ['-42 is unchanged', -42, -42],
  ])('%s', (_name, input, expected) => {
    expect(goRound(input)).toBe(expected)
  })

  it('never returns negative zero', () => {
    expect(Object.is(goRound(-0.4), 0)).toBe(true)
    expect(Object.is(goRound(-0), 0)).toBe(true)
    expect(Object.is(goRound(0.4), 0)).toBe(true)
  })

  it.each([
    // The float product of the dollar amount times 100 decides the rounding, as in Go.
    ['1.005 * 100 = 100.49999999999999 rounds down', 1.005 * 100, 100],
    ['10.005 * 100 = 1000.5000000000001 rounds up', 10.005 * 100, 1001],
    ['2.675 * 100 = 267.5 rounds up', 2.675 * 100, 268],
    ['0.285 * 100 = 28.499999999999996 rounds down', 0.285 * 100, 28],
    ['19.99 * 100 = 1998.9999999999998 rounds up', 19.99 * 100, 1999],
  ])('dollars in: %s', (_name, input, expected) => {
    expect(goRound(input)).toBe(expected)
  })

  it('passes NaN through, as Go does', () => {
    expect(goRound(Number.NaN)).toBeNaN()
  })
})

describe('goFloatText (strconv FormatFloat(f, g, -1, 64), as database/sql prints a float)', () => {
  it.each([
    ['a whole number below 1e6', 300, '300'],
    ['a fraction', 566.666, '566.666'],
    ['a long fraction', 666.6666666666666, '666.6666666666666'],
    ['a whole number of 1e6 uses an exponent', 1000000, '1e+06'],
    ['2000000 uses an exponent', 2000000, '2e+06'],
    ['a negative whole number of 1234567', -1234567, '-1.234567e+06'],
    ['999999 stays plain', 999999, '999999'],
    ['zero', 0, '0'],
    ['negative zero', -0, '-0'],
    ['a small number uses an exponent', 0.00001, '1e-05'],
    ['0.0001 stays plain', 0.0001, '0.0001'],
  ])('%s', (_name, input, want) => {
    expect(goFloatText(input)).toBe(want)
  })
})
