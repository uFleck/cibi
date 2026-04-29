import { describe, expect, it } from 'vitest'
import { LAST_CHECK_RESULT_KEY } from '@/components/CheckWidget'

describe('CheckWidget impact wiring', () => {
  it('exports storage key for latest check result handoff', () => {
    expect(LAST_CHECK_RESULT_KEY).toBe('cibi:last-check-result')
  })
})
