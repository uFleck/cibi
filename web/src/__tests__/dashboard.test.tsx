import { describe, it, expect } from 'vitest'
import { formatMoney, formatDate } from '@/lib/format'

describe('formatMoney', () => {
  it('formats positive dollar amount', () => {
    expect(formatMoney(75)).toBe('$75.00')
  })
  it('formats negative dollar amount', () => {
    expect(formatMoney(-15.99)).toBe('-$15.99')
  })
  it('formats zero', () => {
    expect(formatMoney(0)).toBe('$0.00')
  })
  it('formats large amount with thousands separator', () => {
    expect(formatMoney(1234.56)).toBe('$1,234.56')
  })
})

describe('formatDate', () => {
  it('formats ISO string as short month + day', () => {
    expect(formatDate('2026-04-15T12:00:00Z')).toBe('Apr 15')
  })
  it('formats January', () => {
    expect(formatDate('2026-01-01T12:00:00Z')).toBe('Jan 1')
  })
})

describe('Reserved calculation', () => {
  it('sums absolute amounts of recurring transactions with next_occurrence', () => {
    const txns = [
      { amount: -15.99, is_recurring: true, next_occurrence: '2026-04-15T00:00:00Z' },
      { amount: -850.00, is_recurring: true, next_occurrence: '2026-05-01T00:00:00Z' },
      { amount: -20.00, is_recurring: true, next_occurrence: null },
    ]
    const reserved = txns
      .filter(t => t.next_occurrence !== null)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    expect(reserved).toBeCloseTo(865.99, 2)
  })
})
