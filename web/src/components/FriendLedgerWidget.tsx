import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchFriendSummary } from '@/lib/api'
import { formatMoney } from '@/lib/format'

export function FriendLedgerWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['friend-summary'],
    queryFn: fetchFriendSummary,
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Friend Ledger</CardTitle>
        <Link to="/friends">
          <Button variant="ghost" size="sm" aria-label="Go to Friends">
            <ChevronRight size={16} />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading friend summary">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-5 rounded bg-muted animate-pulse" />
            ))}
            <span className="sr-only">Loading...</span>
          </div>
        ) : data && (data.total_owed_to_user !== 0 || data.total_user_owes !== 0) ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">They owe me</span>
              <span className="font-medium tabular-nums text-green-600">
                {formatMoney(data.total_owed_to_user)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">I owe</span>
              <span className="font-medium tabular-nums text-red-500">
                {formatMoney(data.total_user_owes)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-1.5 mt-0.5">
              <span className="font-semibold">Net</span>
              <span
                className={`font-semibold tabular-nums ${
                  data.net > 0
                    ? 'text-green-600'
                    : data.net < 0
                    ? 'text-red-500'
                    : 'text-muted-foreground'
                }`}
              >
                {formatMoney(data.net)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            No outstanding balances
          </p>
        )}
      </CardContent>
    </Card>
  )
}
