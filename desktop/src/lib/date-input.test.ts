import { describe, expect, it } from 'vitest'
import { formatDateBR, parseTypedDate } from '@/lib/date-input'

const today = new Date(2026, 9, 15)

describe('parseTypedDate', () => {
  it.each([
    ['15', '2026-10-15'],
    ['14', '2026-11-14'],
    ['05', '2026-11-05'],
    [' 1 5 ', '2026-10-15'],
  ])('day only %s resolves to the next occurrence', (text, expected) => {
    expect(parseTypedDate(text, today)).toBe(expected)
  })

  it('clamps a day beyond the end of the current month', () => {
    expect(parseTypedDate('31', new Date(2026, 10, 5))).toBe('2026-11-30')
  })

  it('keeps today when the clamped day equals today', () => {
    expect(parseTypedDate('31', new Date(2026, 10, 30))).toBe('2026-11-30')
  })

  it('clamps to February length when the month is shorter', () => {
    expect(parseTypedDate('30', new Date(2026, 1, 28))).toBe('2026-02-28')
  })

  it('rolls over from December into January', () => {
    expect(parseTypedDate('5', new Date(2026, 11, 20))).toBe('2027-01-05')
  })

  it.each([
    ['15/11'],
    ['15-11'],
    ['1511'],
    ['15.11'],
  ])('day and month %s uses the current year', (text) => {
    expect(parseTypedDate(text, today)).toBe('2026-11-15')
  })

  it.each([
    ['15/11/2026'],
    ['15-11-2026'],
    ['15112026'],
    ['15/11/26'],
    ['151126'],
  ])('full date %s', (text) => {
    expect(parseTypedDate(text, today)).toBe('2026-11-15')
  })

  it.each([
    ['31/02'],
    ['32/01'],
    ['15/13'],
    ['0'],
    ['00/11'],
    ['31/02/2026'],
    ['29/02/2026'],
  ])('rejects invalid date %s', (text) => {
    expect(parseTypedDate(text, today)).toBeNull()
  })

  it('accepts leap day in a leap year', () => {
    expect(parseTypedDate('29/02/2028', today)).toBe('2028-02-29')
  })

  it.each([
    ['123'],
    ['12345'],
    ['1234567'],
    ['123456789'],
    ['abc'],
    ['15/ab'],
    ['15//11'],
    ['15/11/2'],
    ['15/11/2026/1'],
    [''],
    ['   '],
  ])('rejects unparseable input %j', (text) => {
    expect(parseTypedDate(text, today)).toBeNull()
  })

  it('accepts an already ISO date', () => {
    expect(parseTypedDate('2026-11-15', today)).toBe('2026-11-15')
  })

  it('rejects an invalid ISO date', () => {
    expect(parseTypedDate('2026-02-30', today)).toBeNull()
  })
})

describe('formatDateBR', () => {
  it('formats an ISO date as DD/MM/YYYY', () => {
    expect(formatDateBR('2026-11-15')).toBe('15/11/2026')
  })

  it.each([[''], ['15/11/2026'], ['2026-13-01'], ['2026-02-30'], ['2026-1-5']])(
    'returns an empty string for %j',
    (iso) => {
      expect(formatDateBR(iso)).toBe('')
    }
  )
})
