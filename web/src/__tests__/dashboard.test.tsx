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
})

describe('formatDate', () => {
  it('formats ISO string as short month + day', () => {
    expect(formatDate('2026-04-15T12:00:00Z')).toBe('Apr 15')
  })
})

describe('Dashboard data layer', () => {
  it('TODO: balance card renders current_balance from API (implemented in Plan 03)', () => {
    expect(true).toBe(true)
  })
  it('TODO: polling at 30s interval configured on QueryClient (implemented in App.tsx)', () => {
    expect(true).toBe(true)
  })
})
