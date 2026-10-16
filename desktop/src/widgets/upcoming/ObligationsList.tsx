import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import type { TransactionResponse } from '@/lib/api'

interface ObligationsListProps {
  transactions: TransactionResponse[]
  currency?: string
  nextPayday: string | null
  selectedId?: string | null
  onSelect?: (id: string) => void
}

export function ObligationsList({ transactions, currency = 'BRL', nextPayday, selectedId = null, onSelect }: ObligationsListProps) {
  const now = new Date()

  const obligations = transactions
    .filter(t => {
      if (t.is_installment) {
        return (
          t.next_occurrence !== null &&
          (t.paid_installments ?? 0) < (t.total_installments ?? 0) &&
          isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
        )
      }
      return (
        t.is_recurring &&
        t.next_occurrence !== null &&
        isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
      )
    })
    .sort((a, b) =>
      new Date(a.next_occurrence!).getTime() - new Date(b.next_occurrence!).getTime()
    )

  const total = obligations.reduce((sum, t) => sum + Math.abs(t.amount), 0)

  return (
    <div className="flex flex-col">

      {obligations.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">No upcoming obligations.</p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/transactions">Add recurring bill</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col">
          {obligations.map(t => (
            <div
              key={t.id}
              data-row={t.id}
              onClick={onSelect ? () => onSelect(t.id) : undefined}
              className={cn(
                'flex items-center py-2 gap-4 hover:bg-muted/30 transition-colors',
                onSelect && 'cursor-pointer',
                t.id === selectedId && 'bg-hl/10 shadow-[inset_2px_0_0_var(--color-hl)]',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm" title={t.description}>{t.description}</span>
              {t.is_installment && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t.paid_installments ?? 0}/{t.total_installments ?? '?'}
                </span>
              )}
              <MoneyValue
                amount={t.amount}
                currency={currency}
                tone="negative"
                showSign="auto"
                className="shrink-0 text-sm font-medium"
              />
              <span className="shrink-0 text-xs text-muted-foreground w-14 text-right tabular-nums">
                {formatDate(t.next_occurrence!)}
              </span>
            </div>
          ))}
          <div className="border-t border-line mt-1" />
          <div className="flex items-center py-2 gap-4">
            <span className="flex-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Total reserved
            </span>
            <MoneyValue
              amount={total}
              currency={currency}
              tone="negative"
              showSign="never"
              className="text-sm font-semibold"
            />
          </div>
        </div>
      )}
    </div>
  )
}
