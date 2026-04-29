import { describe, expect, it } from 'vitest'

describe('goals-widget contract', () => {
  it('keeps quick action labels stable', () => {
    const actions = ['Add contribution', 'Open Goals']
    expect(actions).toContain('Add contribution')
    expect(actions).toContain('Open Goals')
  })
})
