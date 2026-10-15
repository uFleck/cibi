import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './use-media-query'

type Listener = (e: MediaQueryListEvent) => void

function installMatchMedia(initial: Record<string, boolean>) {
  const state = { ...initial }
  const listeners = new Map<string, Set<Listener>>()

  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return state[query] ?? false
    },
    media: query,
    addEventListener: (_: string, l: Listener) => {
      if (!listeners.has(query)) listeners.set(query, new Set())
      listeners.get(query)!.add(l)
    },
    removeEventListener: (_: string, l: Listener) => {
      listeners.get(query)?.delete(l)
    },
  })) as unknown as typeof window.matchMedia

  return {
    set(query: string, matches: boolean) {
      state[query] = matches
      listeners.get(query)?.forEach(l => l({ matches } as MediaQueryListEvent))
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  }
}

describe('useMediaQuery', () => {
  const original = window.matchMedia

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    window.matchMedia = original
  })

  it('returns the initial match value', () => {
    installMatchMedia({ '(min-width: 1px)': true, '(min-width: 9999px)': false })
    expect(renderHook(() => useMediaQuery('(min-width: 1px)')).result.current).toBe(true)
    expect(renderHook(() => useMediaQuery('(min-width: 9999px)')).result.current).toBe(false)
  })

  it('updates when the media query changes', () => {
    const mm = installMatchMedia({ '(min-width: 1px)': false })
    const { result } = renderHook(() => useMediaQuery('(min-width: 1px)'))
    expect(result.current).toBe(false)

    act(() => mm.set('(min-width: 1px)', true))
    expect(result.current).toBe(true)

    act(() => mm.set('(min-width: 1px)', false))
    expect(result.current).toBe(false)
  })

  it('re-evaluates when the query argument changes', () => {
    installMatchMedia({ a: true, b: false })
    const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), {
      initialProps: { q: 'a' },
    })
    expect(result.current).toBe(true)
    rerender({ q: 'b' })
    expect(result.current).toBe(false)
  })

  it('removes the listener on unmount', () => {
    const mm = installMatchMedia({ a: true })
    const { unmount } = renderHook(() => useMediaQuery('a'))
    expect(mm.listenerCount('a')).toBe(1)
    unmount()
    expect(mm.listenerCount('a')).toBe(0)
  })
})
