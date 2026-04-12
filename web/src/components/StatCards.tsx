import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/format'
import type { AccountResponse, TransactionResponse } from '@/lib/api'

interface StatCardsProps {
  account: AccountResponse
  recurringTxns: TransactionResponse[]
}

export function StatCards({ account, recurringTxns }: StatCardsProps) {
  const reserved = recurringTxns
    .filter(t => t.next_occurrence !== null)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const liquid = account.current_balance - reserved

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            Current Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-semibold">
            {formatMoney(account.current_balance)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            Reserved
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-semibold">
            {formatMoney(reserved)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            Liquid
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className="text-xl font-semibold"
            style={{ color: liquid <= 0 ? 'var(--color-risk-blocked)' : undefined }}
          >
            {formatMoney(liquid)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
