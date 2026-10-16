// Row selection shared by the shell and the pages. A page owns its rows and actions; it publishes the
// selected row as a SelectionDetail, and the inspector (or a drawer on Overview) renders it.

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { KvRow } from '@/components/ui/kv-list'
import { useKeyboardShortcuts, type ShortcutBinding } from '@/hooks/useKeyboardShortcuts'

export interface SelectionAction {
  id: string
  label: string
  icon?: LucideIcon
  /** Shortcut shown on the button. The page binds it (see useListSelection). */
  keys?: string
  variant?: 'default' | 'outline' | 'destructive'
  disabled?: boolean
  run: () => void
}

export interface SelectionDetail {
  id: string
  title: string
  /** Small line above the amount, e.g. a due date. */
  eyebrow: string
  amount: ReactNode
  badge?: string
  rows: KvRow[]
  actions: SelectionAction[]
}

export interface SelectionApi {
  selectedId: string | null
  select: (id: string | null) => void
}

export const SelectionContext = createContext<SelectionApi>({ selectedId: null, select: () => {} })

/** The detail the current page published, or null. Read by the inspector only. */
export const SelectionDetailContext = createContext<SelectionDetail | null>(null)

/** Stable setter: pages publish through this, so publishing never re-renders the page. */
export const SelectionPublishContext = createContext<(detail: SelectionDetail | null) => void>(() => {})

export function useSelection(): SelectionApi {
  return useContext(SelectionContext)
}

/**
 * Publishes the detail for the selected row. Pass null when nothing is selected. The detail is
 * cleared when the page unmounts.
 */
export function usePublishSelection(detail: SelectionDetail | null) {
  const publish = useContext(SelectionPublishContext)
  useEffect(() => {
    publish(detail)
  })
  useEffect(() => () => publish(null), [publish])
}

export interface ListSelectionOptions {
  /** Row ids in display order. */
  ids: string[]
  /** E or Enter on the selected row. */
  onEdit?: (id: string) => void
  /** M on the selected row. */
  onMarkPaid?: (id: string) => void
}

/**
 * List keyboard model for a page: J/K and the arrows move the selection, E or Enter edits, M marks
 * paid. Esc (clear selection) is global in the shell. Shortcuts exist only while the page is mounted.
 */
export function useListSelection({ ids, onEdit, onMarkPaid }: ListSelectionOptions) {
  const { selectedId, select } = useSelection()
  const present = selectedId !== null && ids.includes(selectedId)
  const selected = present ? selectedId : null
  const wasPresent = useRef(false)

  // A selection that was in the list and then left it (filter, delete, account switch) is cleared.
  // One that was never in the list (a ?select= link before the rows load) is kept.
  useEffect(() => {
    if (present) {
      wasPresent.current = true
    } else if (wasPresent.current) {
      wasPresent.current = false
      if (selectedId !== null) select(null)
    }
  }, [present, selectedId, select])

  function move(step: number) {
    if (ids.length === 0) return
    const index = selected === null ? -1 : ids.indexOf(selected)
    const next = index < 0 ? (step > 0 ? 0 : ids.length - 1) : Math.min(Math.max(index + step, 0), ids.length - 1)
    select(ids[next])
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-row]')).find(el => el.dataset.row === ids[next])
    row?.scrollIntoView?.({ block: 'nearest' })
  }

  const edit = () => {
    if (selected !== null) onEdit?.(selected)
  }

  // Bound only while there are rows, so the arrow keys keep scrolling an empty page.
  const bindings: ShortcutBinding[] = ids.length === 0 ? [] : [
    { keys: 'j', label: 'Next row', group: 'List', scope: 'list', run: () => move(1) },
    { keys: 'ArrowDown', label: 'Next row', group: 'List', scope: 'list', run: () => move(1) },
    { keys: 'k', label: 'Previous row', group: 'List', scope: 'list', run: () => move(-1) },
    { keys: 'ArrowUp', label: 'Previous row', group: 'List', scope: 'list', run: () => move(-1) },
    { keys: 'e', label: 'Edit', group: 'List', scope: 'list', run: edit },
    { keys: 'Enter', label: 'Edit', group: 'List', scope: 'list', skipInteractive: true, run: edit },
    {
      keys: 'm',
      label: 'Mark paid',
      group: 'List',
      scope: 'list',
      run: () => {
        if (selected !== null) onMarkPaid?.(selected)
      },
    },
  ]
  useKeyboardShortcuts(bindings)

  return { selectedId: selected, select }
}
