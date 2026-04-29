import { useContext, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from 'boneyard-js/react'
import { toast } from 'sonner'
import { AccountContext } from '@/App'
import {
  fetchAccounts,
  fetchGoalsTracking,
  createGoal,
  addGoalLedgerEntry,
  type GoalsTrackingGoalResponse,
  type CheckResponse,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MoneyValue } from '@/components/ui/money-value'
import { formatDate } from '@/lib/format'
import { LAST_CHECK_RESULT_KEY } from '@/components/CheckWidget'

export function sourceVariant(source: string): 'default' | 'secondary' | 'outline' {
  if (source === 'manual') return 'default'
  if (source === 'recurring') return 'outline'
  return 'secondary'
}

export function progressTone(progress: number): string {
  if (progress >= 80) return 'bg-[var(--color-verdict-yes)]'
  if (progress >= 40) return 'bg-[var(--color-risk-medium)]'
  return 'bg-[var(--color-risk-high)]'
}

export function formatUpdatedCue(updatedAtUtc?: string): string | null {
  if (!updatedAtUtc) return null
  return `Updated ${new Date(updatedAtUtc).toLocaleTimeString()}`
}

export function GoalsPage() {
  const { selectedAccountId } = useContext(AccountContext)
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [quickAmountByGoal, setQuickAmountByGoal] = useState<Record<string, string>>({})

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const accountId = selectedAccountId || accounts[0]?.id
  const currency = accounts.find(a => a.id === accountId)?.currency ?? 'BRL'

  const trackingQuery = useQuery({
    queryKey: ['goals', 'tracking', accountId],
    queryFn: () => fetchGoalsTracking(accountId),
    enabled: !!accountId,
  })

  const goals = trackingQuery.data?.top_goals ?? []
  const activities = trackingQuery.data?.recent_activity ?? []

  const activityByGoal = useMemo(() => {
    return activities.reduce<Record<string, typeof activities>>((acc, item) => {
      if (!acc[item.goal_id]) acc[item.goal_id] = []
      if (acc[item.goal_id].length < 2) acc[item.goal_id].push(item)
      return acc
    }, {})
  }, [activities])

  const createMut = useMutation({
    mutationFn: () => createGoal({
      account_id: accountId,
      name,
      target_amount: Number(target),
      start_date_utc: new Date().toISOString(),
    }),
    onSuccess: async () => {
      setName('')
      setTarget('')
      await qc.invalidateQueries({ queryKey: ['goals', 'tracking', accountId] })
      toast.success('Goal created')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const addMut = useMutation({
    mutationFn: ({ goalId, amount }: { goalId: string; amount: number }) => addGoalLedgerEntry(goalId, {
      amount,
      type: 'contribution',
      source: 'manual',
    }),
    onSuccess: async (_, vars) => {
      setQuickAmountByGoal(prev => ({ ...prev, [vars.goalId]: '' }))
      await qc.invalidateQueries({ queryKey: ['goals', 'tracking', accountId] })
      toast.success('Contribution added')
    },
    onError: (e: Error & { code?: string }) => toast.error(e.code ? `${e.code}: ${e.message}` : e.message),
  })

  const updatedCue = formatUpdatedCue(trackingQuery.data?.updated_at_utc)

  const emptyState = !trackingQuery.isLoading && !trackingQuery.isError && goals.length === 0
  const latestCheckResult = useMemo<CheckResponse | null>(() => {
    try {
      const raw = sessionStorage.getItem(LAST_CHECK_RESULT_KEY)
      return raw ? (JSON.parse(raw) as CheckResponse) : null
    } catch {
      return null
    }
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Goals Tracking</h1>
        {updatedCue ? <span className="text-xs text-muted-foreground">{updatedCue}</span> : null}
      </div>

      {trackingQuery.isError ? (
        <Card>
          <CardContent className="py-6 flex flex-col gap-3">
            <p className="text-sm text-[var(--color-verdict-no)]">Could not load goals tracking.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.error('Retrying goals tracking...')
                void trackingQuery.refetch()
              }}
              className="w-fit"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Skeleton
        name="goals-summary"
        loading={trackingQuery.isLoading}
        fallback={<div className="h-24 rounded-xl border bg-card/50 animate-pulse" aria-label="Skeleton summary" />}
      >
        {trackingQuery.data ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Goals</p><p className="text-lg font-semibold">{trackingQuery.data.summary.goals_count}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Completed</p><p className="text-lg font-semibold">{trackingQuery.data.summary.completed_count}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Invested</p><p className="text-lg font-semibold"><MoneyValue amount={trackingQuery.data.summary.total_invested} currency={currency} tone="neutral" showSign="never" /></p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Remaining</p><p className="text-lg font-semibold"><MoneyValue amount={trackingQuery.data.summary.total_remaining} currency={currency} tone="neutral" showSign="never" /></p></CardContent></Card>
          </div>
        ) : null}
      </Skeleton>

      {emptyState ? (
        <Card>
          <CardContent className="py-8 text-center flex flex-col gap-2 items-center">
            <p className="font-medium">No goals yet</p>
            <p className="text-sm text-muted-foreground">Create your first goal and start tracking contributions over time.</p>
          </CardContent>
        </Card>
      ) : null}

      {latestCheckResult && latestCheckResult.goal_impacts.length > 0 ? (
        <Card>
          <CardContent className="py-4 flex flex-col gap-2">
            <p className="text-sm font-medium">Latest purchase impact</p>
            {latestCheckResult.goal_impacts.slice(0, 4).map(impact => (
              <div key={impact.goal_id} className="text-xs flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{impact.goal_name} · {impact.severity}</span>
                <span className="font-medium">
                  <MoneyValue amount={impact.remaining_before} currency={currency} tone="neutral" showSign="never" /> → <MoneyValue amount={impact.remaining_after} currency={currency} tone="neutral" showSign="never" />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px_120px] gap-2 items-center">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Goal name" className="border rounded px-2 py-1.5" />
        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target amount" className="border rounded px-2 py-1.5" />
        <Button onClick={() => createMut.mutate()} disabled={!accountId || !name || !target}>Create</Button>
      </div>

      <Skeleton
        name="goals-list"
        loading={trackingQuery.isLoading}
        fallback={<div className="h-48 rounded-xl border bg-card/50 animate-pulse" aria-label="Skeleton list" />}
      >
        <div className="border rounded-lg divide-y">
          {goals.map((g: GoalsTrackingGoalResponse) => {
            const progress = Math.max(0, Math.min(100, g.progress_pct))
            const inputVal = quickAmountByGoal[g.id] ?? ''
            return (
              <div key={g.id} className="p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <MoneyValue amount={g.invested_total} currency={currency} tone="neutral" showSign="never" /> / <MoneyValue amount={g.target_amount} currency={currency} tone="neutral" showSign="never" /> · Remaining <MoneyValue amount={g.remaining_amount} currency={currency} tone="neutral" showSign="never" />
                    </p>
                  </div>
                  <Badge variant="secondary">{g.status}</Badge>
                </div>

                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${progressTone(progress)}`} style={{ width: `${progress}%` }} />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progress.toFixed(1)}%</span>
                  <span>{g.target_date_utc ? `Target ${formatDate(g.target_date_utc)}` : 'No target date'}</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    value={inputVal}
                    onChange={e => setQuickAmountByGoal(prev => ({ ...prev, [g.id]: e.target.value }))}
                    placeholder="Quick contribution"
                    className="border rounded px-2 py-1 text-sm sm:w-56"
                  />
                  <Button
                    size="sm"
                    onClick={() => addMut.mutate({ goalId: g.id, amount: Number(inputVal) })}
                    disabled={!inputVal}
                  >
                    Add contribution
                  </Button>
                </div>

                {(activityByGoal[g.id] ?? []).length > 0 ? (
                  <div className="text-xs flex flex-col gap-1">
                    {(activityByGoal[g.id] ?? []).map(a => (
                      <div key={a.entry_id} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{a.type} · {formatDate(a.timestamp_utc)}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant={sourceVariant(a.source)}>{a.source}</Badge>
                          <MoneyValue amount={a.amount} currency={currency} tone="neutral" showSign="auto" />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </Skeleton>

      <Skeleton
        name="goals-activity"
        loading={trackingQuery.isLoading}
        fallback={<div className="h-24 rounded-xl border bg-card/50 animate-pulse" aria-label="Skeleton activity" />}
      >
        <Card>
          <CardContent className="py-4 flex flex-col gap-2">
            <p className="text-sm font-medium">Recent activity</p>
            {activities.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent entries.</p>
            ) : (
              activities.slice(0, 6).map(a => (
                <div key={a.entry_id} className="text-xs flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{a.goal_name} · {a.type} · {formatDate(a.timestamp_utc)}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={sourceVariant(a.source)}>{a.source}</Badge>
                    <MoneyValue amount={a.amount} currency={currency} tone="neutral" showSign="auto" />
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </Skeleton>
    </div>
  )
}
