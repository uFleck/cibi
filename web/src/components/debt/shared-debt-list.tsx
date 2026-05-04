import { Check, Copy, Eye, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SharedDebtListProps } from '@/components/debt/shared-debt-list.types'

export function SharedDebtList({
  mode = 'auto',
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

  const showMobile = mode === 'mobile' || mode === 'auto'
  const showDesktop = mode === 'desktop' || mode === 'auto'

  return (
    <>
      {showMobile ? (
        <div className={mode === 'auto' ? 'sm:hidden flex flex-col gap-2' : 'flex flex-col gap-2'}>
          {items.map(item => {
            return (
              <div key={item.id} className="border rounded-md p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                  </div>
                  <MoneyValue amount={item.amount} currency={item.currency} showSign="auto" tone="auto" className="font-semibold" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {item.status.tooltip ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant={item.status.tone} className="cursor-help">{item.status.label}</Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{item.status.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge variant={item.status.tone}>{item.status.label}</Badge>
                  )}
                  <div className="flex gap-2">
                    {onCopy && item.canCopy ? (
                      <Button variant="outline" size="sm" onClick={() => onCopy(item.id)} aria-label="Copy">
                        <Copy size={14} />
                      </Button>
                    ) : null}
                    {onConfirm && item.canConfirm ? (
                      <Button variant="outline" size="sm" onClick={() => onConfirm(item.id)} aria-label="Confirm">
                        <Check size={14} />
                      </Button>
                    ) : null}
                    {onOpen && item.canOpen ? (
                      <Button variant="outline" size="sm" onClick={() => onOpen(item.id)} aria-label="Open">
                        <Eye size={14} />
                      </Button>
                    ) : null}
                    {onEdit && item.canEdit ? (
                      <Button variant="outline" size="sm" onClick={() => onEdit(item.id)} aria-label="Edit">
                        <Pencil size={14} />
                      </Button>
                    ) : null}
                    {onDelete && item.canDelete ? (
                      <Button variant="outline" size="sm" onClick={() => onDelete(item.id)} aria-label="Delete">
                        <Trash2 size={14} />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {showDesktop ? (
        <div className={mode === 'auto' ? 'hidden sm:block border rounded-md overflow-x-auto' : 'border rounded-md overflow-x-auto'}>
          <table className="min-w-full w-max text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(item => {
                return (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{item.subtitle}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      <MoneyValue amount={item.amount} currency={item.currency} showSign="auto" tone="auto" />
                    </td>
                    <td className="px-3 py-2">
                      {item.status.tooltip ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={item.status.tone} className="cursor-help">{item.status.label}</Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{item.status.tooltip}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge variant={item.status.tone}>{item.status.label}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        {onCopy && item.canCopy ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onCopy(item.id)} aria-label="Copy">
                            <Copy size={14} />
                          </Button>
                        ) : null}
                        {onConfirm && item.canConfirm ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onConfirm(item.id)} aria-label="Confirm">
                            <Check size={14} />
                          </Button>
                        ) : null}
                        {onOpen && item.canOpen ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onOpen(item.id)} aria-label="Open">
                            <Eye size={14} />
                          </Button>
                        ) : null}
                        {onEdit && item.canEdit ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onEdit(item.id)} aria-label="Edit">
                            <Pencil size={14} />
                          </Button>
                        ) : null}
                        {onDelete && item.canDelete ? (
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onDelete(item.id)} aria-label="Delete">
                            <Trash2 size={14} />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  )
}
