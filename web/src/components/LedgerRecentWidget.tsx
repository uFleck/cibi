import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { fetchLedger, type AccountResponse, type LedgerEntryResponse } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  account: AccountResponse
}

export function LedgerRecentWidget({ account }: Props) {
  const navigate = useNavigate()
  const { data: entries, isLoading } = useQuery({
    queryKey: ['ledger', account.id],
    queryFn: () => fetchLedger(account.id),
  })

  if (isLoading || !entries || entries.length === 0) return null

  const recent = entries.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        {recent.map((entry: LedgerEntryResponse) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 py-1">
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground">{formatDate(entry.posted_at)}</span>
              <span className="text-sm truncate">{entry.description}</span>
            </div>
            <span
              className={
                entry.amount >= 0
                  ? 'text-sm font-medium text-green-600 shrink-0'
                  : 'text-sm font-medium text-red-500 shrink-0'
              }
            >
              {formatMoney(entry.amount, account.currency)}
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => navigate({ to: '/transactions' })}
          className="text-xs text-muted-foreground hover:text-foreground mt-1 self-start"
        >
          View all
        </button>
      </CardContent>
    </Card>
  )
}
