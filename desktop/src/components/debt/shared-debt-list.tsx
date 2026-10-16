import { useMemo } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'
import { RowActions } from '@/components/ui/row-actions'
import { ROW_GROUP, ROW_KEYS, type RowAction } from '@/lib/row-actions'
import { cn } from '@/lib/utils'
import { useListSelection, useLocalSelection } from '@/shell/selection'
import type { DebtListItemVM, SharedDebtListProps } from '@/components/debt/shared-debt-list.types'

export function SharedDebtList({
  items,
  loading = false,
  error,
  emptyTitle = 'No items',
  emptyHint = 'Nothing to show yet',
  onRetry,
  onConfirm,
  onDelete,
  onEdit,
  confirmLabel = 'Mark paid',
  selectedId = null,
  onSelect,
}: SharedDebtListProps) {
  const local = useLocalSelection()
  const selection = useMemo(() => (onSelect ? { selectedId, select: onSelect } : local), [onSelect, selectedId, local])

  const actionsOf = (item: DebtListItemVM): RowAction[] => [
    ...(onConfirm && item.canConfirm
      ? [{ id: 'confirm', label: confirmLabel, icon: Check, keys: ROW_KEYS.confirm, run: () => onConfirm(item.id) }]
      : []),
    ...(onEdit && item.canEdit
      ? [{ id: 'edit', label: 'Edit', icon: Pencil, keys: ROW_KEYS.edit, primary: true, run: () => onEdit(item.id) }]
      : []),
    ...(onDelete && item.canDelete
      ? [{ id: 'delete', label: 'Delete', icon: Trash2, keys: ROW_KEYS.delete, variant: 'destructive' as const, run: () => onDelete(item.id) }]
      : []),
  ]

  const { selectedId: activeId, select, activate } = useListSelection({
    ids: items.map(item => item.id),
    actionsFor: id => {
      const item = items.find(candidate => candidate.id === id)
      return item ? actionsOf(item) : []
    },
    selection,
  })

  if (loading) {
    return (
      <div className="flex flex-col gap-2" data-testid="shared-debt-list-loading">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="border rounded-md p-4 flex items-center justify-between gap-3" data-testid="shared-debt-list-error">
        <p className="text-sm text-destructive">{error}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        ) : null}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8" data-testid="shared-debt-list-empty">
        <p className="font-semibold">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground mt-1">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div
      className="@container flex flex-col overflow-hidden rounded-md border border-line bg-surface divide-y divide-line"
      onPointerDown={activate}
      onFocus={activate}
    >
      {items.map(item => (
        <div
          key={item.id}
          data-row={item.id}
          data-selected={item.id === activeId}
          onClick={() => select(item.id)}
          className={cn(
            ROW_GROUP,
            'flex cursor-pointer items-center gap-3 px-3 py-1.5 transition-colors hover:bg-surface-2',
            item.id === activeId && 'bg-hl/10 shadow-[inset_2px_0_0_var(--color-hl)]',
          )}
        >
          <div className={cn(
            'w-1 self-stretch rounded-full shrink-0',
            item.status.tone === 'outline' ? 'bg-warn/60' :
            item.status.tone === 'secondary' ? 'bg-hl/60' :
            'bg-line'
          )} />

          <div className="flex-1 min-w-0">
            <div className="truncate text-[12px] font-medium">{item.title}</div>
            <div className="truncate text-[11px] text-muted-foreground">{item.subtitle}</div>
          </div>

          {item.category ? (
            <span className="hidden max-w-[10rem] shrink-0 truncate rounded-full border border-line bg-surface-2 px-2 py-px text-[10.5px] text-muted-foreground @md:inline-block">
              {item.category}
            </span>
          ) : null}

          <MoneyValue
            amount={item.amount}
            currency={item.currency}
            showSign="auto"
            tone="auto"
            className="shrink-0 text-[12px] font-medium"
          />

          <RowActions actions={actionsOf(item)} className="w-20" />
        </div>
      ))}
    </div>
  )
}
