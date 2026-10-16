// Pure budget rules: month keys, pace, row status and limit validation.
import { describe, expect, it } from 'vitest'
import {
  AHEAD_MARGIN,
  isValidMonth,
  localMonth,
  paceFor,
  statusFor,
  utcMonth,
  validateLimits,
  type BudgetLimit,
} from './budget'

describe('isValidMonth', () => {
  it('accepts YYYY-MM with a month of 01 to 12', () => {
    expect(isValidMonth('2026-10')).toBe(true)
    expect(isValidMonth('2026-01')).toBe(true)
    expect(isValidMonth('2026-12')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const value of ['', '2026-1', '2026-00', '2026-13', '26-10', '2026-10-01', '2026/10', ' 2026-10']) {
      expect(isValidMonth(value)).toBe(false)
    }
  })
})

describe('localMonth and utcMonth', () => {
  it('localMonth uses the local calendar month', () => {
    expect(localMonth(new Date(2026, 9, 31, 23, 30))).toBe('2026-10')
    expect(localMonth(new Date(2026, 10, 1, 0, 30))).toBe('2026-11')
    expect(localMonth(new Date(2026, 0, 5))).toBe('2026-01')
  })

  it('utcMonth uses the UTC calendar month', () => {
    expect(utcMonth(new Date(Date.UTC(2026, 10, 1)))).toBe('2026-11')
    expect(utcMonth(new Date(Date.UTC(2026, 9, 31, 23, 59)))).toBe('2026-10')
    expect(utcMonth(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01')
  })
})

describe('paceFor', () => {
  const now = new Date(2026, 9, 16) // 16 Oct 2026, local

  it('uses the day of the month for the current month', () => {
    expect(paceFor('2026-10', now)).toEqual({ day: 16, daysInMonth: 31, ratio: 16 / 31 })
  })

  it('is complete for a past month', () => {
    expect(paceFor('2026-09', now)).toEqual({ day: 30, daysInMonth: 30, ratio: 1 })
    expect(paceFor('2026-02', now)).toEqual({ day: 28, daysInMonth: 28, ratio: 1 })
  })

  it('is at zero for a future month', () => {
    expect(paceFor('2026-11', now)).toEqual({ day: 0, daysInMonth: 30, ratio: 0 })
  })

  it('knows leap years', () => {
    expect(paceFor('2024-02', new Date(2024, 1, 29))).toEqual({ day: 29, daysInMonth: 29, ratio: 1 })
  })
})

describe('statusFor', () => {
  const base = { limit: 1000, isFixed: false, spent: 0, scheduled: 0, ratio: 0.5 }

  it('is null without a limit', () => {
    expect(statusFor({ ...base, limit: null, spent: 5000 })).toBeNull()
  })

  it('is over when spent plus scheduled is above the limit', () => {
    expect(statusFor({ ...base, spent: 800, scheduled: 300 })).toBe('over')
    expect(statusFor({ ...base, spent: 1100 })).toBe('over')
  })

  it('is not over at exactly the limit', () => {
    expect(statusFor({ ...base, spent: 600, scheduled: 400, ratio: 1 })).toBe('ok')
  })

  it('is ahead when spent is above pace plus the margin', () => {
    expect(statusFor({ ...base, spent: 700, ratio: 0.5 })).toBe('ahead')
    expect(statusFor({ ...base, spent: 500, ratio: 0.3 })).toBe('ahead')
  })

  it('is ok on pace', () => {
    expect(statusFor({ ...base, spent: 500, ratio: 0.5 })).toBe('ok')
  })

  it('treats exactly pace plus the margin as not ahead', () => {
    const limit = 100
    const ratio = 0.5
    expect(statusFor({ limit, isFixed: false, spent: 62, scheduled: 0, ratio })).toBe('ok')
    expect(statusFor({ limit, isFixed: false, spent: 63, scheduled: 0, ratio })).toBe('ahead')
    expect(AHEAD_MARGIN).toBe(0.12)
  })

  it('never marks a fixed category ahead, but still marks it over', () => {
    expect(statusFor({ ...base, isFixed: true, spent: 900, ratio: 0.1 })).toBe('ok')
    expect(statusFor({ ...base, isFixed: true, spent: 1100, ratio: 0.1 })).toBe('over')
  })

  it('treats a zero limit as over when anything is spent or scheduled', () => {
    expect(statusFor({ ...base, limit: 0 })).toBe('ok')
    expect(statusFor({ ...base, limit: 0, spent: 1 })).toBe('over')
    expect(statusFor({ ...base, limit: 0, scheduled: 1 })).toBe('over')
  })
})

describe('validateLimits', () => {
  const ok: BudgetLimit = { category: 'Mercado', monthlyLimit: 50000, isFixed: false }

  it('is null for no limits and for valid limits', () => {
    expect(validateLimits([])).toBeNull()
    expect(
      validateLimits([
        ok,
        { category: 'Moradia', monthlyLimit: 0, isFixed: true },
      ]),
    ).toBeNull()
  })

  it('requires a category after trimming', () => {
    expect(validateLimits([{ ...ok, category: '   ' }])).toBe('category is required')
    expect(validateLimits([{ ...ok, category: '' }])).toBe('category is required')
  })

  it('requires monthlyLimit to be a non-negative safe integer', () => {
    const message = 'monthlyLimit must be a non-negative integer (cents)'
    for (const monthlyLimit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateLimits([{ ...ok, monthlyLimit }])).toBe(message)
    }
  })

  it('requires isFixed to be a boolean', () => {
    expect(validateLimits([{ ...ok, isFixed: 'yes' as unknown as boolean }])).toBe('isFixed must be a boolean')
  })

  it('rejects a duplicate trimmed category', () => {
    expect(validateLimits([ok, { ...ok, category: ' Mercado ' }])).toBe('duplicate category: Mercado')
  })

  it('returns the first problem in order', () => {
    expect(validateLimits([{ ...ok, monthlyLimit: -1 }, { ...ok, category: '' }])).toBe(
      'monthlyLimit must be a non-negative integer (cents)',
    )
    expect(validateLimits([{ ...ok, category: '' , monthlyLimit: -1 }])).toBe('category is required')
  })
})
