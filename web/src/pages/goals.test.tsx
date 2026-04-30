import { describe, expect, it } from 'vitest'
import { formatUpdatedCue, progressTone, sourceVariant } from '@/pages/goals-helpers'

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
