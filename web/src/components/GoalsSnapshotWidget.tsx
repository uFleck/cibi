import { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Skeleton } from 'boneyard-js/react'
import { AccountContext } from '@/App'
import { fetchAccounts, fetchGoalsTracking } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'

export function GoalsSnapshotWidget() {
  const { selectedAccountId } = useContext(AccountContext)
  const navigate = useNavigate()

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const accountId = selectedAccountId || accounts[0]?.id
  const currency = accounts.find(a => a.id === accountId)?.currency ?? 'BRL'

  const trackingQuery = useQuery({
    queryKey: ['goals', 'tracking', accountId],
    queryFn: () => fetchGoalsTracking(accountId),
    enabled: !!accountId,
  })

  const goals = (trackingQuery.data?.top_goals ?? []).slice(0, 5)

  return (
    <Card>
      <CardContent className="py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Goals Snapshot</p>
          <span className="text-xs text-muted-foreground">Top urgent goals</span>
        </div>

        {trackingQuery.isError ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-verdict-no)]">Could not load goals.</p>
            <Button size="sm" variant="outline" onClick={() => void trackingQuery.refetch()}>Retry</Button>
          </div>
        ) : null}

        <Skeleton
          name="goals-widget"
          loading={trackingQuery.isLoading}
          fallback={<div className="h-24 rounded-md bg-card/50 border animate-pulse" />}
        >
          {goals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No goals yet. Open Goals to create your first one.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {goals.map(goal => (
                <div key={goal.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center text-xs">
                  <div>
                    <p className="font-medium truncate">{goal.name}</p>
                    <p className="text-muted-foreground">{goal.progress_pct.toFixed(1)}% · Remaining <MoneyValue amount={goal.remaining_amount} currency={currency} tone="neutral" showSign="never" /></p>
                  </div>
                  <span className="text-muted-foreground"><MoneyValue amount={goal.invested_total} currency={currency} tone="neutral" showSign="never" /></span>
                </div>
              ))}
            </div>
          )}
        </Skeleton>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate({ to: '/goals' })}>Add contribution</Button>
          <Button size="sm" onClick={() => navigate({ to: '/goals' })}>Open Goals</Button>
        </div>
      </CardContent>
    </Card>
  )
}
