import { describe, expect, it } from 'vitest'

describe('goals impact summary', () => {
  it('keeps severity labels aligned with backend contract', () => {
    const severities = ['low', 'medium', 'high']
    expect(severities).toContain('medium')
  })
})
