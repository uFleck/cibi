import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { countInCurrentPayWindow } from '@/lib/occurrences'
import { effectiveAmount, type TransactionResponse } from '@/lib/api'
import { asNeededLeft, asNeededReserved, isScheduledBill } from '@/lib/bills'

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
        isScheduledBill(t) &&
        t.next_occurrence !== null &&
        isInCurrentPayWindow(t.next_occurrence, now, nextPayday)
      )
    })
    .sort((a, b) =>
      new Date(a.next_occurrence!).getTime() - new Date(b.next_occurrence!).getTime()
    )

  // A bill due several times before the payday (a weekly one) is reserved once for each.
  const timesDue = (t: TransactionResponse) => (t.is_recurring ? countInCurrentPayWindow(t, nextPayday) : 1)
  const asNeeded = transactions.filter(t => t.is_as_needed && !t.is_uncertain)
  const total = obligations.reduce((sum, t) => sum + Math.abs(effectiveAmount(t)) * timesDue(t), 0)
    + asNeededReserved(asNeeded)

  return (
    <div className="flex flex-col">

      {obligations.length === 0 && asNeeded.length === 0 ? (
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
                'flex items-center py-1.5 gap-3 hover:bg-muted/30 transition-colors',
                onSelect && 'cursor-pointer',
                t.id === selectedId && 'bg-hl/10 shadow-[inset_2px_0_0_var(--color-hl)]',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[13px]" title={t.title}>{t.title}</span>
              <span className="w-8 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {t.is_installment
                  ? `${t.paid_installments ?? 0}/${t.total_installments ?? '?'}`
                  : timesDue(t) > 1 ? `×${timesDue(t)}` : null}
              </span>
              <MoneyValue
                amount={effectiveAmount(t)}
                currency={currency}
                tone="negative"
                showSign="auto"
                className="min-w-[5.5rem] shrink-0 text-right text-[13px] font-medium whitespace-nowrap"
              />
              <span className="w-[4.5rem] shrink-0 text-right text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {formatDate(t.next_occurrence!)}
              </span>
            </div>
          ))}
          {asNeeded.map(t => (
            <div
              key={t.id}
              data-row={t.id}
              onClick={onSelect ? () => onSelect(t.id) : undefined}
              className={cn(
                'flex items-center py-1.5 gap-3 hover:bg-muted/30 transition-colors',
                onSelect && 'cursor-pointer',
                t.id === selectedId && 'bg-hl/10 shadow-[inset_2px_0_0_var(--color-hl)]',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[13px]" title={t.title}>{t.title}</span>
              <span aria-hidden className="w-8 shrink-0" />
              <MoneyValue
                amount={-Math.max(0, asNeededLeft(t))}
                currency={currency}
                tone="negative"
                showSign="auto"
                className="min-w-[5.5rem] shrink-0 text-right text-[13px] font-medium whitespace-nowrap"
              />
              <span className="w-[4.5rem] shrink-0 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                left this month
              </span>
            </div>
          ))}
          <div className="border-t border-line mt-1" />
          <div className="flex items-center py-1.5 gap-3">
            <span className="flex-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Total reserved
            </span>
            <span aria-hidden className="w-8 shrink-0" />
            <MoneyValue
              amount={total}
              currency={currency}
              tone="negative"
              showSign="never"
              className="min-w-[5.5rem] shrink-0 text-right text-[13px] font-semibold whitespace-nowrap"
            />
            <span aria-hidden className="w-[4.5rem] shrink-0" />
          </div>
        </div>
      )}
    </div>
  )
}
