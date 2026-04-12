import { describe, it, expect } from 'vitest'
import { formatMoney } from '@/lib/format'

describe('Verdict card data contracts', () => {
  it('TODO: YES verdict renders can_buy=true result (implemented in Plan 03)', () => {
    expect(true).toBe(true)
  })
  it('TODO: NO verdict renders can_buy=false result (implemented in Plan 03)', () => {
    expect(true).toBe(true)
  })
  it('formats purchasing power for display', () => {
    expect(formatMoney(234.56)).toBe('$234.56')
  })
})
