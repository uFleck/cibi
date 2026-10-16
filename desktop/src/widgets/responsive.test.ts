import { describe, expect, it } from 'vitest'
import { effectiveSpan, wallModeFor } from './responsive'

describe('wallModeFor', () => {
  it.each([
    [1600, 'full'],
    [1100, 'full'],
    [1099, 'compact'],
    [900, 'compact'],
    [899, 'two'],
    [640, 'two'],
    [639, 'one'],
    [320, 'one'],
  ] as const)('width %i is %s', (width, mode) => {
    expect(wallModeFor(width)).toBe(mode)
  })
})

describe('effectiveSpan', () => {
  it('keeps the saved spans in full mode', () => {
    for (const span of [3, 4, 6, 8, 12] as const) {
      expect(effectiveSpan(span, 'full')).toBe(span)
    }
  })

  it('snaps 8 and 4 down to 6 in compact mode, leaves the others', () => {
    expect(effectiveSpan(8, 'compact')).toBe(6)
    expect(effectiveSpan(4, 'compact')).toBe(6)
    expect(effectiveSpan(3, 'compact')).toBe(3)
    expect(effectiveSpan(6, 'compact')).toBe(6)
    expect(effectiveSpan(12, 'compact')).toBe(12)
  })

  it('makes two columns in two mode, full width stays full', () => {
    expect(effectiveSpan(3, 'two')).toBe(6)
    expect(effectiveSpan(4, 'two')).toBe(6)
    expect(effectiveSpan(8, 'two')).toBe(6)
    expect(effectiveSpan(12, 'two')).toBe(12)
  })

  it('is one column in one mode', () => {
    for (const span of [3, 4, 6, 8, 12] as const) {
      expect(effectiveSpan(span, 'one')).toBe(12)
    }
  })
})
