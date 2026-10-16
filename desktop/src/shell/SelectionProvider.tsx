import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  SelectionContext,
  SelectionDetailContext,
  SelectionPublishContext,
  type SelectionApi,
  type SelectionDetail,
} from './selection'

interface SelectionProviderProps {
  /** Selection is cleared whenever this changes (the current route). */
  resetKey: string
  children: ReactNode
}

export function SelectionProvider({ resetKey, children }: SelectionProviderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SelectionDetail | null>(null)
  const [resetFor, setResetFor] = useState(resetKey)

  if (resetKey !== resetFor) {
    setResetFor(resetKey)
    setSelectedId(null)
    setDetail(null)
  }

  const select = useCallback((id: string | null) => setSelectedId(id), [])
  const selection = useMemo<SelectionApi>(() => ({ selectedId, select }), [selectedId, select])

  return (
    <SelectionContext.Provider value={selection}>
      <SelectionPublishContext.Provider value={setDetail}>
        <SelectionDetailContext.Provider value={detail}>{children}</SelectionDetailContext.Provider>
      </SelectionPublishContext.Provider>
    </SelectionContext.Provider>
  )
}
