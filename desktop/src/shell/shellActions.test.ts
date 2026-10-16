import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestShellAction, useShellAction } from './shellActions'

afterEach(() => {
  vi.useRealTimers()
})

describe('shell actions', () => {
  it('calls the subscribed handler immediately when requested', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useShellAction('focus-check', handler))

    requestShellAction('focus-check')

    expect(handler).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('delivers a request made before the page mounted, once', () => {
    requestShellAction('new-transaction')
    const handler = vi.fn()
    const { unmount } = renderHook(() => useShellAction('new-transaction', handler))

    expect(handler).toHaveBeenCalledTimes(1)
    unmount()

    const later = vi.fn()
    const second = renderHook(() => useShellAction('new-transaction', later))
    expect(later).not.toHaveBeenCalled()
    second.unmount()
  })

  it('drops a stale request instead of running it on a later mount', () => {
    vi.useFakeTimers()
    requestShellAction('focus-search')
    vi.advanceTimersByTime(5000)

    const handler = vi.fn()
    const { unmount } = renderHook(() => useShellAction('focus-search', handler))

    expect(handler).not.toHaveBeenCalled()
    unmount()
  })

  it('calls the latest handler after a rerender without resubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ handler }: { handler: () => void }) => useShellAction('focus-check', handler),
      { initialProps: { handler: first } },
    )

    rerender({ handler: second })
    requestShellAction('focus-check')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('stops calling a handler after it unmounts', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useShellAction('focus-search', handler))
    unmount()

    requestShellAction('focus-search')

    expect(handler).not.toHaveBeenCalled()
  })
})
