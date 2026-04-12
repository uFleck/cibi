import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatMoney, formatDate } from '@/lib/format'
import type { TransactionResponse } from '@/lib/api'

interface ObligationsListProps {
  transactions: TransactionResponse[]
}

export function ObligationsList({ transactions }: ObligationsListProps) {
  const obligations = transactions
    .filter(t => t.is_recurring && t.next_occurrence !== null)
    .sort((a, b) =>
      new Date(a.next_occurrence!).getTime() - new Date(b.next_occurrence!).getTime()
    )

  const total = obligations.reduce((sum, t) => sum + t.amount, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Upcoming Obligations</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {obligations.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">
            No upcoming obligations.
          </p>
        ) : (
          <div>
            {obligations.map(t => (
              <div
                key={t.id}
                className="flex items-center px-6 py-2 gap-4"
              >
                <span className="flex-1 text-base">{t.description}</span>
                <span
                  className="text-sm tabular-nums"
                  style={{ color: t.amount < 0 ? 'var(--color-risk-blocked)' : undefined }}
                >
                  {formatMoney(t.amount)}
                </span>
                <span className="text-sm text-muted-foreground w-14 text-right">
                  {formatDate(t.next_occurrence!)}
                </span>
              </div>
            ))}
            <Separator />
            <div className="flex items-center px-6 py-3 gap-4">
              <span className="flex-1 text-sm font-semibold">Total reserved:</span>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: 'var(--color-risk-blocked)' }}
              >
                {formatMoney(total)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
