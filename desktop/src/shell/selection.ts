// Row selection shared by the shell and the pages. A page owns its rows and actions; it publishes the
// selected row as a SelectionDetail, and the inspector (or a drawer on Overview) renders it.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { KvRow } from '@/components/ui/kv-list'
import type { RowAction } from '@/lib/row-actions'
import { useActiveList } from '@/hooks/useActiveList'
import { useKeyboardShortcuts, type ShortcutBinding } from '@/hooks/useKeyboardShortcuts'

export type SelectionAction = RowAction

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
  /** The actions of one row. Each action with `keys` runs on the selected row; Enter runs the primary one. */
  actionsFor?: (id: string) => RowAction[]
  /** Who owns the selected id. Defaults to the shell, whose inspector shows the selected row's detail. */
  selection?: SelectionApi
}

/** A selection a list keeps for itself, for lists whose rows have no inspector detail. */
export function useLocalSelection(): SelectionApi {
  const [selectedId, select] = useState<string | null>(null)
  return useMemo(() => ({ selectedId, select }), [selectedId])
}

/**
 * List keyboard model: J/K and the arrows move the selection; the selected row's actions run on their
 * own keys (E edit, D delete, M mark paid...); Enter runs the primary action. Shortcuts exist only while
 * the list is mounted and is the active one on the page (see useActiveList). Esc (clear selection) is
 * global in the shell, so a list with its own selection binds it itself.
 */
export function useListSelection({ ids, actionsFor, selection }: ListSelectionOptions) {
  const shell = useSelection()
  const own = selection !== undefined
  const { selectedId, select } = selection ?? shell
  const { isActive, activate } = useActiveList(ids.length > 0)
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

  const actions = selected !== null && actionsFor ? actionsFor(selected) : []
  const run = (action: RowAction) => {
    if (!action.disabled) action.run()
  }

  // Bound only while there are rows and this is the active list, so the arrow keys keep scrolling an
  // empty page and two lists on one page never answer the same key.
  const bindings: ShortcutBinding[] = !isActive ? [] : [
    { keys: 'j', label: 'Próxima linha', group: 'List', scope: 'list', run: () => move(1) },
    { keys: 'ArrowDown', label: 'Próxima linha', group: 'List', scope: 'list', run: () => move(1) },
    { keys: 'k', label: 'Linha anterior', group: 'List', scope: 'list', run: () => move(-1) },
    { keys: 'ArrowUp', label: 'Linha anterior', group: 'List', scope: 'list', run: () => move(-1) },
    ...(own && selected !== null
      ? [{ keys: 'Escape', label: 'Limpar seleção', group: 'List', scope: 'list' as const, run: () => select(null) }]
      : []),
    ...actions.flatMap(action => {
      const list: ShortcutBinding[] = []
      if (action.keys) list.push({ keys: action.keys, label: action.label, group: 'List', scope: 'list', run: () => run(action) })
      if (action.primary) list.push({ keys: 'Enter', label: action.label, group: 'List', scope: 'list', skipInteractive: true, run: () => run(action) })
      return list
    }),
  ]
  useKeyboardShortcuts(bindings)

  return { selectedId: selected, select, activate }
}
