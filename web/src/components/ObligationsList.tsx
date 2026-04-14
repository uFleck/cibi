import { formatMoney, formatDate } from '@/lib/format'
import type { TransactionResponse } from '@/lib/api'

interface ObligationsListProps {
  transactions: TransactionResponse[]
  currency?: string
}

export function ObligationsList({ transactions, currency = 'USD' }: ObligationsListProps) {
  const obligations = transactions
    .filter(t => t.is_recurring && t.next_occurrence !== null)
    .sort((a, b) =>
      new Date(a.next_occurrence!).getTime() - new Date(b.next_occurrence!).getTime()
    )

  const total = obligations.reduce((sum, t) => sum + Math.abs(t.amount / 100), 0)

  return (
    <div className="rounded-xl border border-border/60 bg-card flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
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
              <span
                className="text-sm tabular-nums font-medium"
                style={{ color: t.amount < 0 ? 'var(--color-verdict-no)' : undefined }}
              >
                {formatMoney(t.amount / 100, currency)}
              </span>
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
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: 'var(--color-verdict-no)' }}
            >
              {formatMoney(total, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
