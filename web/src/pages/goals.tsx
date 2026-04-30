import { useContext, useMemo, useState, type ReactNode } from 'react'
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
  type GoalsTrackingActivityResponse,
  type CheckResponse,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ValueInput } from '@/components/ui/value-input'
import { Badge } from '@/components/ui/badge'
import { MoneyValue } from '@/components/ui/money-value'
import { formatDate } from '@/lib/format'
import { LAST_CHECK_RESULT_KEY } from '@/components/CheckWidget'
import { formatUpdatedCue, progressTone, sourceVariant } from './goals-helpers'

function parseCreateGoalTarget(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

interface GoalSummaryCardProps {
  label: string
  value: ReactNode
  hint: string
}

function GoalSummaryCard({ label, value, hint }: GoalSummaryCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="h-2 w-2 rounded-full bg-primary/40" aria-hidden="true" />
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}

const EMPTY_GOALS: GoalsTrackingGoalResponse[] = []
const EMPTY_ACTIVITIES: GoalsTrackingActivityResponse[] = []

export function GoalsPage() {
  const { selectedAccountId } = useContext(AccountContext)
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [quickAmountByGoal, setQuickAmountByGoal] = useState<Record<string, string>>({})

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const accountId = selectedAccountId || accounts[0]?.id
  const accountName = accounts.find(a => a.id === accountId)?.name
  const currency = accounts.find(a => a.id === accountId)?.currency ?? 'BRL'

  const trackingQuery = useQuery({
    queryKey: ['goals', 'tracking', accountId],
    queryFn: () => fetchGoalsTracking(accountId),
    enabled: !!accountId,
  })

  const goals = trackingQuery.data?.top_goals ?? EMPTY_GOALS
  const activities = trackingQuery.data?.recent_activity ?? EMPTY_ACTIVITIES
  const trimmedGoalName = name.trim()
  const parsedTargetAmount = parseCreateGoalTarget(target)

  const activityByGoal = useMemo(() => {
    return activities.reduce<Record<string, typeof activities>>((acc, item) => {
      if (!acc[item.goal_id]) acc[item.goal_id] = []
      if (acc[item.goal_id].length < 2) acc[item.goal_id].push(item)
      return acc
    }, {})
  }, [activities])

  const createMut = useMutation({
    mutationFn: ({ goalName, targetAmount }: { goalName: string; targetAmount: number }) => createGoal({
      account_id: accountId,
      name: goalName,
      target_amount: targetAmount,
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
  const isCreateDisabled = !accountId || !trimmedGoalName || parsedTargetAmount == null || createMut.isPending

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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Savings goals</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Goals Tracking</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Plan targets, monitor progress, and keep purchase impact visible{accountName ? ` for ${accountName}` : ''}.
          </p>
        </div>
        {updatedCue ? (
          <span className="w-fit rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            {updatedCue}
          </span>
        ) : null}
      </div>

      {trackingQuery.isError ? (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm" role="alert" aria-label="Goals tracking error">
          <CardContent className="py-6 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-destructive">Could not load goals tracking.</p>
              <p className="text-xs text-muted-foreground">
                Your saved goals were not changed. Retry the tracking query when the connection is ready.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.error('Retrying goals tracking...')
                void trackingQuery.refetch()
              }}
              className="w-fit border-destructive/30 text-destructive hover:text-destructive"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Skeleton
        name="goals-summary"
        loading={trackingQuery.isLoading}
        fallback={(
          <div className="space-y-3" role="status" aria-label="Loading goals tracking summary">
            <div className="h-24 rounded-xl border border-border/40 bg-card/60 animate-pulse" aria-hidden="true" />
            <span className="sr-only">Loading goals tracking summary...</span>
          </div>
        )}
      >
        {trackingQuery.data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Goals summary">
            <GoalSummaryCard
              label="Goals"
              value={trackingQuery.data.summary.goals_count}
              hint="Tracked targets"
            />
            <GoalSummaryCard
              label="Completed"
              value={trackingQuery.data.summary.completed_count}
              hint="Finished goals"
            />
            <GoalSummaryCard
              label="Invested"
              value={<MoneyValue amount={trackingQuery.data.summary.total_invested} currency={currency} tone="neutral" showSign="never" className="text-foreground" />}
              hint="Already saved"
            />
            <GoalSummaryCard
              label="Remaining"
              value={<MoneyValue amount={trackingQuery.data.summary.total_remaining} currency={currency} tone="neutral" showSign="never" className="text-foreground" />}
              hint="Left to fund"
            />
          </div>
        ) : null}
      </Skeleton>

      {emptyState ? (
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="py-12 text-center flex flex-col gap-2 items-center">
            <p className="text-base font-semibold">No goals yet</p>
            <p className="max-w-sm text-sm text-muted-foreground text-pretty">
              Create your first goal and CIBI will track contributions, progress, and purchase impact over time.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {latestCheckResult && latestCheckResult.goal_impacts.length > 0 ? (
        <Card className="border-border/60 bg-card shadow-sm" aria-label="Latest purchase impact">
          <CardContent className="py-5 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Latest purchase impact</p>
              <p className="text-sm text-muted-foreground">How your last CIBI check would move active goals.</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/50 p-3 flex flex-col gap-2">
              {latestCheckResult.goal_impacts.slice(0, 4).map(impact => (
                <div key={impact.goal_id} className="text-xs flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="font-medium text-foreground">{impact.goal_name}</span>
                  <span className="flex items-center justify-between gap-2 text-muted-foreground sm:justify-end">
                    <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{impact.severity}</span>
                    <span className="font-medium tabular-nums text-foreground">
                      <MoneyValue amount={impact.remaining_before} currency={currency} tone="neutral" showSign="never" /> → <MoneyValue amount={impact.remaining_after} currency={currency} tone="neutral" showSign="never" />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* S01 audit checklist: page shell/header/summary/create form use CIBI primitives here; goal cards and quick contribution controls intentionally stay raw for S02; behavior/API contracts must remain unchanged. */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="py-5">
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_220px_120px] sm:items-end"
            onSubmit={e => {
              e.preventDefault()
              if (isCreateDisabled || parsedTargetAmount == null) return
              createMut.mutate({ goalName: trimmedGoalName, targetAmount: parsedTargetAmount })
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-name">Goal name</Label>
              <Input
                id="goal-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Trip, emergency fund, new bike..."
                disabled={createMut.isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal-target">Target amount</Label>
              <ValueInput
                id="goal-target"
                value={target}
                onValueChange={setTarget}
                placeholder="123,45"
                disabled={createMut.isPending}
              />
            </div>
            <Button type="submit" disabled={isCreateDisabled}>
              {createMut.isPending ? 'Creating...' : 'Create'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Skeleton
        name="goals-list"
        loading={trackingQuery.isLoading}
        fallback={(
          <div className="space-y-3" role="status" aria-label="Loading goals list">
            <div className="h-48 rounded-xl border border-border/40 bg-card/60 animate-pulse" aria-hidden="true" />
            <span className="sr-only">Loading goals list...</span>
          </div>
        )}
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
        fallback={(
          <div className="space-y-3" role="status" aria-label="Loading goals activity">
            <div className="h-24 rounded-xl border border-border/40 bg-card/60 animate-pulse" aria-hidden="true" />
            <span className="sr-only">Loading goals activity...</span>
          </div>
        )}
      >
        <Card className="border-border/60 shadow-sm">
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
