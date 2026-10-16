import { useCallback, useSyncExternalStore } from 'react'

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = () => hasMatchMedia() && window.matchMedia(query).matches

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
