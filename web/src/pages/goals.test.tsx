import { describe, expect, it } from 'vitest'
import { formatUpdatedCue, parseContributionAmount, progressTone, sourceVariant } from '@/pages/goals-helpers'

describe('goals tracking view helpers', () => {
  it('maps activity source to expected badge variant', () => {
    expect(sourceVariant('manual')).toBe('default')
    expect(sourceVariant('recurring')).toBe('outline')
    expect(sourceVariant('system')).toBe('secondary')
  })

  it('maps progress to urgency tone classes', () => {
    expect(progressTone(85)).toBe('bg-[var(--color-verdict-yes)]')
    expect(progressTone(50)).toBe('bg-[var(--color-risk-medium)]')
    expect(progressTone(20)).toBe('bg-[var(--color-risk-high)]')
  })

  it('renders updated cue only when timestamp exists', () => {
    expect(formatUpdatedCue()).toBeNull()
    expect(formatUpdatedCue('2026-01-01T10:00:00Z')).toMatch(/^Updated /)
  })
})

describe('parseContributionAmount', () => {
  it('returns null for blank, non-numeric, zero, and negative values', () => {
    expect(parseContributionAmount('')).toBeNull()
    expect(parseContributionAmount('   ')).toBeNull()
    expect(parseContributionAmount('abc')).toBeNull()
    expect(parseContributionAmount('0')).toBeNull()
    expect(parseContributionAmount('-1')).toBeNull()
    expect(parseContributionAmount('Infinity')).toBeNull()
    expect(parseContributionAmount('-0')).toBeNull()
  })

  it('parses positive integers and decimals', () => {
    expect(parseContributionAmount('50')).toBe(50)
    expect(parseContributionAmount('123.45')).toBe(123.45)
    expect(parseContributionAmount('0.01')).toBe(0.01)
  })

  it('normalizes Brazilian comma decimals', () => {
    expect(parseContributionAmount('12,50')).toBe(12.5)
    expect(parseContributionAmount('1,99')).toBe(1.99)
  })
})
