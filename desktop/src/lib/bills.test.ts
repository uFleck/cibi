import { describe, expect, it } from 'vitest'
import { asNeededForWindow, asNeededLeft, asNeededReserved, isScheduledBill } from '@/lib/bills'

const base = { is_recurring: true, is_uncertain: false, is_as_needed: false, amount: -100, month_budget: null, month_spent: null }
const diapers = { ...base, is_as_needed: true, amount: -300, month_budget: -300, month_spent: -100 }

describe('isScheduledBill', () => {
  it('is a recurring bill that is neither uncertain nor as-needed', () => {
    expect(isScheduledBill(base)).toBe(true)
    expect(isScheduledBill({ ...base, is_uncertain: true })).toBe(false)
    expect(isScheduledBill(diapers)).toBe(false)
    expect(isScheduledBill({ ...base, is_recurring: false })).toBe(false)
  })
})

describe('as-needed bills', () => {
  it('reserve what is left of the month, nothing once overspent, nothing while uncertain', () => {
    expect(asNeededLeft(diapers)).toBe(200)
    expect(asNeededReserved([diapers, base])).toBe(200)
    expect(asNeededLeft({ ...diapers, month_spent: -350 })).toBe(-50)
    expect(asNeededReserved([{ ...diapers, month_spent: -350 }])).toBe(0)
    expect(asNeededReserved([{ ...diapers, is_uncertain: true }])).toBe(0)
  })

  it('a window counts the rest of this month, then each later day its share of the budget', () => {
    const now = new Date(2026, 9, 21, 12) // 21 Oct
    // 21 Oct to 1 Nov: only the rest of October.
    expect(asNeededForWindow([diapers], now, new Date(2026, 10, 1), now)).toBe(200)
    // Up to 16 Nov: plus 15 of November's 30 days.
    expect(asNeededForWindow([diapers], now, new Date(2026, 10, 16), now)).toBe(350)
    // A following window does not count October again.
    expect(asNeededForWindow([diapers], new Date(2026, 9, 29), new Date(2026, 10, 16), now, false)).toBe(150)
  })
})
