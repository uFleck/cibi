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
import { formatUpdatedCue, parseContributionAmount, progressTone, sourceVariant } from './goals-helpers'

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

interface SafeMoneyValueProps {
  amount: number
  currency: string
  tone?: 'auto' | 'positive' | 'negative' | 'neutral'
  showSign?: 'auto' | 'always' | 'never'
  className?: string
}

function SafeMoneyValue({ amount, currency, tone = 'neutral', showSign = 'never', className }: SafeMoneyValueProps) {
  if (!Number.isFinite(amount)) {
    return <span className={className ?? 'text-muted-foreground'}>—</span>
  }

  return <MoneyValue amount={amount} currency={currency} tone={tone} showSign={showSign} className={className} />
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(100, progress))
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

      {/* S02 keeps S01 create behavior intact while rendering existing goals as CIBI cards below. */}
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
        <section className="flex flex-col gap-3" aria-label="Goal progress cards">
          {goals.map((g: GoalsTrackingGoalResponse) => {
            const progress = clampProgress(g.progress_pct)
            const toneClass = progressTone(progress)
            const inputVal = quickAmountByGoal[g.id] ?? ''
            const goalActivity = activityByGoal[g.id] ?? []
            const targetDateCopy = g.target_date_utc ? `Target ${formatDate(g.target_date_utc)}` : 'No target date'

            return (
              <Card key={g.id} className="overflow-hidden border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="py-5 flex flex-col gap-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold tracking-tight text-balance">{g.name}</p>
                        <Badge variant="secondary" className="capitalize">{g.status}</Badge>
                      </div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        {targetDateCopy}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-right sm:min-w-80">
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Invested</p>
                        <p className="text-sm font-semibold tabular-nums">
                          <SafeMoneyValue amount={g.invested_total} currency={currency} tone="neutral" showSign="never" className="text-foreground" />
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Target</p>
                        <p className="text-sm font-semibold tabular-nums">
                          <SafeMoneyValue amount={g.target_amount} currency={currency} tone="neutral" showSign="never" className="text-foreground" />
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Remaining</p>
                        <p className="text-sm font-semibold tabular-nums">
                          <SafeMoneyValue amount={g.remaining_amount} currency={currency} tone="neutral" showSign="never" className="text-foreground" />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2" aria-label={`${g.name} progress`}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-foreground">Progress</span>
                      <span className="font-semibold tabular-nums text-foreground">{progress.toFixed(1)}%</span>
                    </div>
                    <div
                      className="h-3 w-full overflow-hidden rounded-full bg-muted shadow-inner"
                      role="progressbar"
                      aria-label={`${g.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Number(progress.toFixed(1))}
                    >
                      <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start">
                    <div className="rounded-xl bg-muted/30 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Recent activity</p>
                        {goalActivity.length > 0 ? (
                          <span className="text-[10px] text-muted-foreground">Latest {goalActivity.length}</span>
                        ) : null}
                      </div>
                      {goalActivity.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {goalActivity.map(a => (
                            <div key={a.entry_id} className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2 text-xs">
                              <span className="min-w-0 flex flex-col gap-0.5">
                                <span className="font-medium capitalize text-foreground">{a.type}</span>
                                <span className="text-muted-foreground">{formatDate(a.timestamp_utc)}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <Badge variant={sourceVariant(a.source)} className="capitalize">{a.source}</Badge>
                                <SafeMoneyValue amount={a.amount} currency={currency} tone="neutral" showSign="auto" className="text-foreground" />
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No recent activity for this goal.</p>
                      )}
                    </div>

                    <form
                      className="rounded-xl border border-border/60 bg-background/60 p-3 flex flex-col gap-3"
                      onSubmit={e => {
                        e.preventDefault()
                        const parsed = parseContributionAmount(inputVal)
                        if (parsed == null || addMut.isPending) return
                        addMut.mutate({ goalId: g.id, amount: parsed })
                      }}
                    >
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`contribution-${g.id}`}>Quick contribution</Label>
                        <ValueInput
                          id={`contribution-${g.id}`}
                          value={inputVal}
                          onValueChange={val => setQuickAmountByGoal(prev => ({ ...prev, [g.id]: val }))}
                          placeholder="0,00"
                          allowNegative={false}
                          disabled={addMut.isPending && addMut.variables?.goalId === g.id}
                        />
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        className="min-h-10 transition-transform active:scale-[0.96]"
                        disabled={parseContributionAmount(inputVal) == null || addMut.isPending}
                      >
                        {addMut.isPending && addMut.variables?.goalId === g.id ? 'Adding...' : 'Add'}
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </section>
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
