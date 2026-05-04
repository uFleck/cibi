export type DebtListMode = 'auto' | 'mobile' | 'desktop'
export type DebtListView = 'owner' | 'public-friend' | 'public-group'
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
  amount: number
  currency: string
  status: DebtListStatusVM
  meta?: string
  canConfirm?: boolean
  canDelete?: boolean
  canCopy?: boolean
  canOpen?: boolean
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
  onCopy?: (id: string) => void
  onOpen?: (id: string) => void
  onEdit?: (id: string) => void
}
