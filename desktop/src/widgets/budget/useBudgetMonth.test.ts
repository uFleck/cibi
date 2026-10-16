import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBudgetMonth } from './useBudgetMonth'

describe('useBudgetMonth', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('rolls over to the new month when the window regains focus', () => {
    const { result } = renderHook(() => useBudgetMonth())
    expect(result.current).toBe('2026-10')

    vi.setSystemTime(new Date(2026, 10, 1, 0, 1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(result.current).toBe('2026-11')
  })

  it('rolls over on the interval without any event', () => {
    const { result } = renderHook(() => useBudgetMonth())

    vi.setSystemTime(new Date(2026, 10, 1, 0, 1))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current).toBe('2026-11')
  })
})
