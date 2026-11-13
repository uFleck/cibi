import { useCallback, useState } from 'react'
import { parseKinds, type BillKind } from '@/lib/bill-kinds'

function read(key: string): Set<BillKind> {
  try {
    return new Set(parseKinds(window.localStorage.getItem(key)))
  } catch {
    return new Set(parseKinds(null))
  }
}

/** Which bill types a list shows, remembered per list. One-offs start hidden. */
export function useBillKindFilter(storageKey: string) {
  const [selected, setSelected] = useState<Set<BillKind>>(() => read(storageKey))

  const toggle = useCallback((kind: BillKind) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        // Storage can be unavailable; the filter still works for this session.
      }
      return next
    })
  }, [storageKey])

  return { selected, toggle }
}
