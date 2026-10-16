import { useCallback, useEffect, useId, useSyncExternalStore } from 'react'

// Several lists can be mounted on one page. Only one of them owns the row shortcuts (j/k, e, d...) at a
// time: the one the user last pointed at, or the first mounted when they have not pointed at any.

const mounted: string[] = []
let chosen: string | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function current(): string | null {
  return chosen !== null && mounted.includes(chosen) ? chosen : (mounted[0] ?? null)
}

/** `enabled` is false while the list has no rows, so an empty list never holds the shortcuts. */
export function useActiveList(enabled: boolean) {
  const id = useId()

  useEffect(() => {
    if (!enabled) return
    mounted.push(id)
    emit()
    return () => {
      mounted.splice(mounted.indexOf(id), 1)
      emit()
    }
  }, [id, enabled])

  const active = useSyncExternalStore(subscribe, current, current)
  const activate = useCallback(() => {
    if (chosen === id) return
    chosen = id
    emit()
  }, [id])

  return { isActive: enabled && active === id, activate }
}
