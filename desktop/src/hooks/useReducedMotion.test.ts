import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from './useReducedMotion'

const QUERY = '(prefers-reduced-motion: reduce)'

describe('useReducedMotion', () => {
  const original = window.matchMedia
  let matches = false
  let listeners = new Set<(e: MediaQueryListEvent) => void>()

  beforeEach(() => {
    matches = false
    listeners = new Set()
    window.matchMedia = vi.fn((query: string) => ({
      get matches() {
        return query === QUERY && matches
      },
      media: query,
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => {
        listeners.add(l)
      },
      removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => {
        listeners.delete(l)
      },
    })) as unknown as typeof window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = original
  })

  it('is false when reduced motion is not requested', () => {
    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(false)
  })

  it('follows the system preference and its changes', () => {
    matches = true
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)

    act(() => {
      matches = false
      listeners.forEach(l => l({ matches: false } as MediaQueryListEvent))
    })

    expect(result.current).toBe(false)
  })
})
