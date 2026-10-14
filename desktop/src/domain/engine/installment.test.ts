import { describe, expect, it } from 'vitest'
import { date } from '../dates'
import { FREQ_MONTHLY } from './engine'
import { nextInstallmentDue } from './installment'

// Port of internal/engine/installment_test.go: same inputs, same expected values.

describe('nextInstallmentDue', () => {
  it('monthly: Jan 31 + 2 installments is Mar 31 (TestNextInstallmentDue_Monthly)', () => {
    const got = nextInstallmentDue(date(2026, 1, 31), 2, FREQ_MONTHLY)
    expect(got.getTime()).toBe(date(2026, 3, 31).getTime())
  })

  it('weekly: Jan 1 + 3 installments is Jan 22 (TestNextInstallmentDue_Weekly)', () => {
    const got = nextInstallmentDue(date(2026, 1, 1), 3, 'weekly')
    expect(got.getTime()).toBe(date(2026, 1, 22).getTime())
  })

  it('unknown frequency defaults to monthly (TestNextInstallmentDue_DefaultsToMonthly)', () => {
    const got = nextInstallmentDue(date(2026, 5, 15), 1, 'unknown')
    expect(got.getTime()).toBe(date(2026, 6, 15).getTime())
  })
})
