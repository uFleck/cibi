import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchPublicFriend, type PeerDebtResponse } from '@/lib/api'
import { formatMoney, formatDate } from '@/lib/format'
import { publicFriendRoute } from '@/router'

function debtStatusLabel(debt: PeerDebtResponse): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (debt.is_confirmed) return { label: 'Paid', variant: 'default' }
  if (debt.is_installment && debt.total_installments != null) {
    return { label: `${debt.paid_installments}/${debt.total_installments} paid`, variant: 'secondary' }
  }
  return { label: 'Unpaid', variant: 'outline' }
}

export function FriendPublicPage() {
  const { token } = publicFriendRoute.useParams()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-friend', token],
    queryFn: () => fetchPublicFriend(token),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 flex flex-col gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-semibold text-destructive">Balance not found</p>
            <p className="text-sm text-muted-foreground mt-2">
              This link may be invalid or the friend may have been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{data.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">They owe you</span>
              <span className="font-medium tabular-nums text-green-600">
                {formatMoney(data.balance.friend_owes_user)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">You owe them</span>
              <span className="font-medium tabular-nums text-red-500">
                {formatMoney(data.balance.user_owes_friend)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-2 mt-1">
              <span className="font-semibold">Net</span>
              <span
                className={`font-semibold tabular-nums ${
                  data.balance.net > 0
                    ? 'text-green-600'
                    : data.balance.net < 0
                    ? 'text-red-500'
                    : 'text-muted-foreground'
                }`}
              >
                {formatMoney(data.balance.net)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debt History</CardTitle>
        </CardHeader>
        <CardContent>
          {data.debts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No debts recorded</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b border-border/40">
                    <th className="text-left pb-2 pr-3">Date</th>
                    <th className="text-left pb-2 pr-3">Description</th>
                    <th className="text-right pb-2 pr-3">Amount</th>
                    <th className="text-left pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.debts.map(debt => {
                    const status = debtStatusLabel(debt)
                    return (
                      <tr key={debt.id} className="border-b border-border/20 last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(debt.date)}</td>
                        <td className="py-2 pr-3">{debt.description}</td>
                        <td
                          className={`py-2 pr-3 text-right tabular-nums ${
                            debt.amount < 0 ? 'text-red-500' : 'text-green-600'
                          }`}
                        >
                          {formatMoney(debt.amount)}
                        </td>
                        <td className="py-2">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">This is a read-only view.</p>
    </div>
  )
}
