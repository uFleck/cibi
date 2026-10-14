import { Check, Copy, Eye, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'
import { cn } from '@/lib/utils'
import type { SharedDebtListProps } from '@/components/debt/shared-debt-list.types'

export function SharedDebtList({
  items,
  loading = false,
  error,
  emptyTitle = 'No items',
  emptyHint = 'Nothing to show yet',
  onRetry,
  onConfirm,
  onDelete,
  onCopy,
  onOpen,
  onEdit,
}: SharedDebtListProps) {
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
    <div className="flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors group">
          <div className={cn(
            'w-1 self-stretch rounded-full shrink-0',
            item.status.tone === 'outline' ? 'bg-amber-400/60' :
            item.status.tone === 'secondary' ? 'bg-blue-400/60' :
            'bg-border/40'
          )} />

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{item.title}</div>
            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
          </div>

          <MoneyValue
            amount={item.amount}
            currency={item.currency}
            showSign="auto"
            tone="auto"
            className="text-sm font-semibold tabular-nums shrink-0"
          />

          <div className="flex gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            {onConfirm && item.canConfirm ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onConfirm(item.id)} aria-label="Confirm">
                <Check size={13} />
              </Button>
            ) : null}
            {onOpen && item.canOpen ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpen(item.id)} aria-label="Open">
                <Eye size={13} />
              </Button>
            ) : null}
            {onEdit && item.canEdit ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item.id)} aria-label="Edit">
                <Pencil size={13} />
              </Button>
            ) : null}
            {onDelete && item.canDelete ? (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => onDelete(item.id)} aria-label="Delete">
                <Trash2 size={13} />
              </Button>
            ) : null}
            {onCopy && item.canCopy ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCopy(item.id)} aria-label="Copy">
                <Copy size={13} />
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
