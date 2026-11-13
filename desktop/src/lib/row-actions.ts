import type { LucideIcon } from 'lucide-react'

export interface RowAction {
  id: string
  label: string
  /** Accessible name when it should say more than the label, e.g. "Editar Mercado". */
  ariaLabel?: string
  icon?: LucideIcon
  variant?: 'default' | 'outline' | 'destructive'
  disabled?: boolean
  run: () => void
}

/** Put on the row element. RowActions reveals itself on hover or focus within. */
export const ROW_GROUP = 'group/row'

/** Pixel width of an actions column that fits `count` buttons, so it never shifts or overflows. */
export function actionsWidth(count: number): number {
  return count * 26 + 14
}
