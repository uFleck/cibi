import { MoneyValue } from '@/components/ui/money-value'
import { formatDate } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import type { TransactionResponse } from '@/lib/api'

interface ObligationsListProps {
  transactions: TransactionResponse[]
  currency?: string
  nextPayday: string | null
}

export function ObligationsList({ transactions, currency = 'BRL', nextPayday }: ObligationsListProps) {
  const now = new Date()

  const obligations = transactions
    .filter(
      t => t.is_recurring && t.next_occurrence !== null
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .sort((a, b) =>
      new Date(a.next_occurrence!).getTime() - new Date(b.next_occurrence!).getTime()
    )

  const total = obligations.reduce((sum, t) => sum + Math.abs(t.amount), 0)

  return (
    <div className="rounded-xl border border-border/60 bg-card flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Upcoming Obligations
        </p>
      </div>

      {obligations.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          No upcoming obligations.
        </p>
      ) : (
        <div className="flex flex-col">
          {obligations.map(t => (
            <div
              key={t.id}
              className="flex items-center px-5 py-2.5 gap-4 hover:bg-muted/30 transition-colors"
            >
              <span className="flex-1 text-sm">{t.description}</span>
              <MoneyValue
                amount={t.amount}
                currency={currency}
                tone="negative"
                showSign="auto"
                className="text-sm font-medium"
              />
              <span className="text-xs text-muted-foreground w-14 text-right tabular-nums">
                {formatDate(t.next_occurrence!)}
              </span>
            </div>
          ))}
          <div className="mx-5 border-t border-border/40 mt-1" />
          <div className="flex items-center px-5 py-3 gap-4">
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
