import { describe, it, expect } from 'vitest'
import { isInCurrentPayWindow } from '@/lib/financial-window'

describe('isInCurrentPayWindow', () => {
  const now = new Date('2026-04-15T12:00:00Z')

  it('includes obligations after now and before next payday', () => {
    expect(isInCurrentPayWindow('2026-04-19T09:00:00Z', now, '2026-04-20')).toBe(true)
  })

  it('excludes obligations on next payday (belongs to next window)', () => {
    expect(isInCurrentPayWindow('2026-04-20T00:00:00Z', now, '2026-04-20')).toBe(false)
  })

  it('includes obligations earlier today (day-based window)', () => {
    expect(isInCurrentPayWindow('2026-04-15T00:00:00Z', now, '2026-04-20')).toBe(true)
  })

  it('includes overdue obligations (stay visible until confirmation)', () => {
    expect(isInCurrentPayWindow('2026-04-10T00:00:00Z', now, '2026-04-20')).toBe(true)
  })

  it('includes the current payday day but excludes the next payday day', () => {
    const payday = new Date('2026-04-20T12:00:00Z')
    expect(isInCurrentPayWindow('2026-04-20T00:00:00Z', payday, '2026-05-10')).toBe(true)
    expect(isInCurrentPayWindow('2026-05-10T00:00:00Z', payday, '2026-05-10')).toBe(false)
  })

  it('includes obligations regardless of date when there is no payday configured', () => {
    expect(isInCurrentPayWindow('2026-05-10T00:00:00Z', now, null)).toBe(true)
    expect(isInCurrentPayWindow('2026-01-01T00:00:00Z', now, null)).toBe(true)
  })
})
