import type { LucideIcon } from 'lucide-react'

/** One key per kind of row action, so the same action has the same shortcut on every list. */
export const ROW_KEYS = {
  edit: 'e',
  delete: 'd',
  confirm: 'm',
  open: 'o',
  add: 'a',
  remove: 'r',
  setDefault: 's',
  copy: 'y',
} as const

export interface RowAction {
  id: string
  label: string
  /** Accessible name when it should say more than the label, e.g. "Edit Groceries". */
  ariaLabel?: string
  icon?: LucideIcon
  /** Plain key that runs the action on the selected row. The list binds it (see useListSelection). */
  keys?: string
  variant?: 'default' | 'outline' | 'destructive'
  disabled?: boolean
  /** Enter runs the primary action. Without one, Enter does nothing. */
  primary?: boolean
  run: () => void
}

/** Put on the row element. RowActions reveals itself on hover, focus within and the selected row. */
export const ROW_GROUP = 'group/row'

/** Pixel width of an actions column that fits `count` buttons, so it never shifts or overflows. */
export function actionsWidth(count: number): number {
  return count * 26 + 14
}
