import type { RowAction } from '@/lib/row-actions'

export type DebtListMode = 'auto' | 'mobile' | 'desktop'
export type DebtListView = 'owner'
export type DebtStatusTone = 'default' | 'secondary' | 'outline'

export interface DebtListStatusVM {
  label: string
  tone: DebtStatusTone
  tooltip?: string
}

export interface DebtListItemVM {
  id: string
  title: string
  subtitle: string
  /** Shown as a chip on wide containers. Omit it for lists without categories. */
  category?: string | null
  amount: number
  currency: string
  status: DebtListStatusVM
  meta?: string
  canConfirm?: boolean
  canDelete?: boolean
  canEdit?: boolean
}

export interface SharedDebtListProps {
  mode?: DebtListMode
  view: DebtListView
  items: DebtListItemVM[]
  loading?: boolean
  error?: string | null
  emptyTitle?: string
  emptyHint?: string
  primaryActionLabel?: string
  onRetry?: () => void
  onConfirm?: (id: string) => void
  onDelete?: (id: string) => void
  onEdit?: (id: string) => void
  /** More actions for a row, shown after the confirm action. */
  extraActionsFor?: (id: string) => RowAction[]
  /** Label of the confirm action. Defaults to "Mark paid". */
  confirmLabel?: string
  /** The selected row, when the page owns it (e.g. for the inspector). Otherwise the list keeps its own. */
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}
