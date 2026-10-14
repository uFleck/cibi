import { describe, it, expect } from 'vitest'
import { formatMoney } from '@/lib/format'

describe('Verdict card data contracts', () => {
  it('formats purchasing power for YES verdict', () => {
    expect(formatMoney(234.56)).toBe('R$\u00a0234,56')
  })
  it('formats buffer remaining', () => {
    expect(formatMoney(10.00)).toBe('R$\u00a010,00')
  })
  it('formats zero purchasing power', () => {
    expect(formatMoney(0)).toBe('R$\u00a00,00')
  })
  it('formats negative purchasing power (over-budget)', () => {
    expect(formatMoney(-50.00)).toBe('-R$\u00a050,00')
  })
})
