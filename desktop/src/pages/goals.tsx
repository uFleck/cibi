import { useContext, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from 'boneyard-js/react'
import { toast } from 'sonner'
import { CircleMinus, CirclePlus, Eye, type LucideIcon } from 'lucide-react'
import { AccountContext } from '@/App'
import {
  fetchAccounts,
  fetchGoalsTracking,
  createGoal,
  updateGoal,
  addGoalLedgerEntry,
  type GoalsTrackingGoalResponse,
  type GoalsTrackingActivityResponse,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { PageHeader, pageEyebrow, pageShell } from '@/components/ui/page-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ValueInput } from '@/components/ui/value-input'
import { Badge } from '@/components/ui/badge'
import { MoneyValue } from '@/components/ui/money-value'
import { KvList } from '@/components/ui/kv-list'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { denseCell, denseHead, denseNumCell, denseRow, denseTable } from '@/components/ui/dense'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { parseDecimalInput } from '@/lib/locale'
import { formatUpdatedCue, parseContributionAmount, sourceVariant } from './goals-helpers'
import { AppModal } from '@/components/AppModal'

function parseCreateGoalTarget(raw: string): number | null {
  const parsed = parseDecimalInput(raw)
  return parsed != null && parsed > 0 ? parsed : null
}

const eyebrow = pageEyebrow

interface GoalSummaryCellProps {
  label: string
  value: ReactNode
  hint: string
}

function GoalSummaryCell({ label, value, hint }: GoalSummaryCellProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-3 py-2.5">
      <span className={eyebrow}>{label}</span>
      <span className="truncate text-lg font-semibold text-foreground">{value}</span>
      <span className="text-[11px] text-faint">{hint}</span>
    </div>
  )
}

interface RowActionProps {
  label: string
  tooltip: string
  icon: LucideIcon
  onClick: () => void
}

function RowAction({ label, tooltip, icon: Icon, onClick }: RowActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} aria-label={label}>
          <Icon size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
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
  if (!Number.isFinite(amount)) return <span className={className ?? 'text-faint'}>—</span>
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
  const [minContribution, setMinContribution] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const [activeGoalId, setActiveGoalId] = useState<string | null>(null)
  const [contributionGoalId, setContributionGoalId] = useState<string | null>(null)
  const [withdrawGoalId, setWithdrawGoalId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [editMinContribution, setEditMinContribution] = useState('')
  const [editContribution, setEditContribution] = useState('')
  const [editWithdrawal, setEditWithdrawal] = useState('')
  const [editWithdrawalReason, setEditWithdrawalReason] = useState('')
  const [isEditOpen, setIsEditOpen] = useState(false)

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
  const activeGoal = goals.find(g => g.id === activeGoalId) ?? null
  const contributionGoal = goals.find(g => g.id === contributionGoalId) ?? null
  const withdrawGoal = goals.find(g => g.id === withdrawGoalId) ?? null
  const trimmedGoalName = name.trim()
  const parsedTargetAmount = parseCreateGoalTarget(target)

  const activityByGoal = useMemo(() => {
    return activities.reduce<Record<string, typeof activities>>((acc, item) => {
      if (!acc[item.goal_id]) acc[item.goal_id] = []
      if (acc[item.goal_id].length < 3) acc[item.goal_id].push(item)
      return acc
    }, {})
  }, [activities])

  const createMut = useMutation({
    mutationFn: ({ goalName, targetAmount }: { goalName: string; targetAmount: number }) => createGoal({
      account_id: accountId,
      name: goalName,
      target_amount: targetAmount,
      min_contribution_per_window: parseContributionAmount(minContribution) ?? 0,
      start_date_utc: new Date().toISOString(),
    }),
    onSuccess: async () => {
      setName('')
      setTarget('')
      setMinContribution('')
      setIsCreateModalOpen(false)
      await qc.invalidateQueries({ queryKey: ['goals', 'tracking', accountId] })
      toast.success('Goal created')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ goalId, payload }: { goalId: string; payload: Partial<{ name: string; target_amount: number; min_contribution_per_window: number }> }) => updateGoal(goalId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['goals', 'tracking', accountId] })
      toast.success('Goal updated')
    },
    onError: (e: Error & { code?: string }) => toast.error(e.code ? `${e.code}: ${e.message}` : e.message),
  })

  const addMut = useMutation({
    mutationFn: ({ goalId, amount }: { goalId: string; amount: number }) => addGoalLedgerEntry(goalId, {
      amount,
      type: 'contribution',
      source: 'manual',
    }),
    onSuccess: async () => {
      setEditContribution('')
      await qc.invalidateQueries({ queryKey: ['goals', 'tracking', accountId] })
      await qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Contribution added')
    },
    onError: (e: Error & { code?: string }) => toast.error(e.code ? `${e.code}: ${e.message}` : e.message),
  })

  const withdrawMut = useMutation({
    mutationFn: ({ goalId, amount, reason }: { goalId: string; amount: number; reason: string }) => addGoalLedgerEntry(goalId, {
      amount,
      type: 'withdrawal',
      source: 'manual',
      note: reason,
    }),
    onSuccess: async () => {
      setEditWithdrawal('')
      setEditWithdrawalReason('')
      await qc.invalidateQueries({ queryKey: ['goals', 'tracking', accountId] })
      await qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Money removed from goal')
    },
    onError: (e: Error & { code?: string }) => toast.error(e.code ? `${e.code}: ${e.message}` : e.message),
  })

  const updatedCue = formatUpdatedCue(trackingQuery.data?.updated_at_utc)
  const isCreateDisabled = !accountId || !trimmedGoalName || parsedTargetAmount == null || createMut.isPending

  const emptyState = !trackingQuery.isLoading && !trackingQuery.isError && goals.length === 0

  const openGoalModal = (goal: GoalsTrackingGoalResponse) => {
    setActiveGoalId(goal.id)
    setEditName(goal.name)
    setEditTarget(goal.target_amount.toString())
    setEditMinContribution((goal.min_contribution_per_window ?? 0).toString())
    setEditWithdrawal('')
    setEditWithdrawalReason('')
    setIsEditOpen(false)
  }

  return (
    <div className={pageShell}>
      <PageHeader
        eyebrow="Savings goals"
        title="Goals Tracking"
        description={`Plan targets, monitor progress, and keep purchase impact visible${accountName ? ` for ${accountName}` : ''}.`}
        actions={
          <>
            {updatedCue ? <span className="whitespace-nowrap font-mono text-[11px] text-faint">{updatedCue}</span> : null}
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)} disabled={!accountId}>New Goal</Button>
          </>
        }
      />

      {trackingQuery.isError ? (
        <div className="flex flex-col gap-3 rounded-md border border-neg/40 bg-neg/10 p-4" role="alert" aria-label="Goals tracking error">
          <div className="flex flex-col gap-1">
            <p className="text-[12px] font-medium text-neg">Could not load goals tracking.</p>
            <p className="text-[12px] text-faint">Your saved goals were not changed. Retry the tracking query when the connection is ready.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.error('Retrying goals tracking...')
              void trackingQuery.refetch()
            }}
            className="w-fit border-neg/40 text-neg hover:text-neg"
          >
            Retry
          </Button>
        </div>
      ) : null}

      <Skeleton
        name="goals-summary"
        loading={trackingQuery.isLoading}
        fallback={(
          <div className="space-y-3" role="status" aria-label="Loading goals tracking summary">
            <div className="h-16 rounded-md border border-line bg-surface animate-pulse" aria-hidden="true" />
            <span className="sr-only">Loading goals tracking summary...</span>
          </div>
        )}
      >
        {trackingQuery.data ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4" aria-label="Goals summary">
            <GoalSummaryCell label="Goals" value={<span className="num">{trackingQuery.data.summary.goals_count}</span>} hint="Tracked targets" />
            <GoalSummaryCell label="Completed" value={<span className="num">{trackingQuery.data.summary.completed_count}</span>} hint="Finished goals" />
            <GoalSummaryCell label="Invested" value={<MoneyValue amount={trackingQuery.data.summary.total_invested} currency={currency} tone="neutral" showSign="never" className="text-foreground" />} hint="Already saved" />
            <GoalSummaryCell label="Remaining" value={<MoneyValue amount={trackingQuery.data.summary.total_remaining} currency={currency} tone="neutral" showSign="never" className="text-foreground" />} hint="Left to fund" />
          </div>
        ) : null}
      </Skeleton>

      {emptyState ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-line bg-surface py-10 text-center">
          <p className="text-[13px] font-semibold text-foreground">No goals yet</p>
          <p className="max-w-sm text-[12px] text-muted-foreground">Create your first goal and CIBI will track contributions, progress, and purchase impact over time.</p>
          <Button size="sm" className="mt-2" onClick={() => setIsCreateModalOpen(true)} disabled={!accountId}>New goal</Button>
        </div>
      ) : null}

      <AppModal
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          setIsCreateModalOpen(open)
          if (!open && !createMut.isPending) {
            setName('')
            setTarget('')
            setMinContribution('')
          }
        }}
        title="New Goal"
        description="Create a savings goal and track progress over time."
      >
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={e => {
            e.preventDefault()
            if (isCreateDisabled || parsedTargetAmount == null) return
            createMut.mutate({ goalName: trimmedGoalName, targetAmount: parsedTargetAmount })
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-name">Goal name</Label>
            <Input id="goal-name" value={name} onChange={e => setName(e.target.value)} placeholder="Trip, emergency fund, new bike..." disabled={createMut.isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-target">Target amount</Label>
            <ValueInput id="goal-target" value={target} onValueChange={setTarget} placeholder="123,45" disabled={createMut.isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="goal-min-contribution">Min contribution / payment window</Label>
            <ValueInput id="goal-min-contribution" value={minContribution} onValueChange={setMinContribution} placeholder="0,00" allowNegative={false} disabled={createMut.isPending} />
          </div>
          <Button type="submit" disabled={isCreateDisabled}>{createMut.isPending ? 'Creating...' : 'Create'}</Button>
        </form>
      </AppModal>

      <Skeleton
        name="goals-list"
        loading={trackingQuery.isLoading}
        fallback={(
          <div className="space-y-3" role="status" aria-label="Loading goals list">
            <div className="h-40 rounded-md border border-line bg-surface animate-pulse" aria-hidden="true" />
            <span className="sr-only">Loading goals list...</span>
          </div>
        )}
      >
        {goals.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className={denseTable}>
              <thead>
                <tr>
                  <th className={denseHead}>Goal</th>
                  <th className={denseHead}>Progress</th>
                  <th className={cn(denseHead, 'text-right')}>Invested / target</th>
                  <th className={cn(denseHead, 'text-right')}>Remaining</th>
                  <th className={cn(denseHead, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {goals.map(g => {
                  const progress = clampProgress(g.progress_pct)
                  return (
                    <tr key={g.id} className={denseRow}>
                      <td className={cn(denseCell, 'max-w-[220px]')}>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground">{g.name}</span>
                          <span className="truncate text-[11px] capitalize text-faint">
                            {g.status}{g.target_date_utc ? ` · ${formatDate(g.target_date_utc)}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className={cn(denseCell, 'w-[200px]')}>
                        <div className="flex items-center gap-2">
                          <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full rounded-full bg-hl" style={{ width: `${progress}%` }} />
                          </div>
                          <Badge variant="secondary" className="num">{progress.toFixed(1)}%</Badge>
                        </div>
                      </td>
                      <td className={denseNumCell}>
                        <SafeMoneyValue amount={g.invested_total} currency={currency} className="text-foreground" />
                        <span className="text-faint"> / </span>
                        <SafeMoneyValue amount={g.target_amount} currency={currency} />
                      </td>
                      <td className={denseNumCell}>
                        <SafeMoneyValue amount={g.remaining_amount} currency={currency} />
                      </td>
                      <td className={cn(denseCell, 'text-right')}>
                        <div className="flex justify-end gap-0.5">
                          <RowAction
                            label="Add money"
                            tooltip="Add contribution"
                            icon={CirclePlus}
                            onClick={() => {
                              setContributionGoalId(g.id)
                              setEditContribution('')
                            }}
                          />
                          <RowAction
                            label="Remove money"
                            tooltip="Remove money"
                            icon={CircleMinus}
                            onClick={() => {
                              setWithdrawGoalId(g.id)
                              setEditWithdrawal('')
                              setEditWithdrawalReason('')
                            }}
                          />
                          <RowAction
                            label="View goal details"
                            tooltip="Access"
                            icon={Eye}
                            onClick={() => openGoalModal(g)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Skeleton>

      <AppModal
        open={!!activeGoal}
        onOpenChange={(open) => {
          if (!open) {
            setActiveGoalId(null)
            setContributionGoalId(null)
            setWithdrawGoalId(null)
            setIsEditOpen(false)
          }
        }}
        title={activeGoal ? `Goal · ${activeGoal.name}` : 'Goal'}
        description="View and edit goal details."
      >
        {activeGoal ? (
          <div className="flex flex-col gap-4">
            <KvList
              rows={[
                { label: 'Invested', value: <SafeMoneyValue amount={activeGoal.invested_total} currency={currency} /> },
                { label: 'Target', value: <SafeMoneyValue amount={activeGoal.target_amount} currency={currency} /> },
                { label: 'Remaining', value: <SafeMoneyValue amount={activeGoal.remaining_amount} currency={currency} /> },
              ]}
            />

            <div className="flex flex-col gap-2" aria-label={`${activeGoal.name} progress`}>
              <div className="flex items-center justify-between gap-3">
                <span className={eyebrow}>Progress</span>
                <span className="num text-[12px] font-semibold text-foreground">{clampProgress(activeGoal.progress_pct).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={`${activeGoal.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(clampProgress(activeGoal.progress_pct).toFixed(1))}>
                <div className="h-full rounded-full bg-hl" style={{ width: `${clampProgress(activeGoal.progress_pct)}%` }} />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className={eyebrow}>Goal settings</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setIsEditOpen(v => !v)}>
                  {isEditOpen ? 'Hide edit' : 'Edit goal'}
                </Button>
              </div>
              {isEditOpen ? (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={e => {
                    e.preventDefault()
                    const parsedTarget = parseCreateGoalTarget(editTarget)
                    const parsedMin = parseContributionAmount(editMinContribution)
                    if (!editName.trim() || parsedTarget == null || parsedMin == null) return
                    updateMut.mutate({
                      goalId: activeGoal.id,
                      payload: {
                        name: editName.trim(),
                        target_amount: parsedTarget,
                        min_contribution_per_window: parsedMin,
                      },
                    })
                  }}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-goal-name">Goal name</Label>
                    <Input id="edit-goal-name" value={editName} onChange={e => setEditName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-goal-target">Target amount</Label>
                    <ValueInput id="edit-goal-target" value={editTarget} onValueChange={setEditTarget} allowNegative={false} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-goal-min">Min contribution / window</Label>
                    <ValueInput id="edit-goal-min" value={editMinContribution} onValueChange={setEditMinContribution} allowNegative={false} />
                  </div>
                  <Button type="submit" size="sm" disabled={updateMut.isPending || !editName.trim() || parseCreateGoalTarget(editTarget) == null || parseContributionAmount(editMinContribution) == null}>
                    {updateMut.isPending ? 'Saving...' : 'Save edits'}
                  </Button>
                </form>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3">
              <p className={eyebrow}>Recent activity</p>
              {(activityByGoal[activeGoal.id] ?? []).length > 0 ? (
                <div className="flex flex-col">
                  {(activityByGoal[activeGoal.id] ?? []).map(a => (
                    <div key={a.entry_id} className="flex flex-col gap-2 border-t border-line py-2 text-[12px] first:border-t-0 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-3">
                      <span className="min-w-0 flex flex-col gap-0.5">
                        <span className="font-medium capitalize text-foreground">{a.type}</span>
                        <span className="text-faint">{formatDate(a.timestamp_utc)}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center gap-2 min-[420px]:justify-end">
                        <Badge variant={sourceVariant(a.source)} className="capitalize">{a.source}</Badge>
                        <SafeMoneyValue amount={a.amount} currency={currency} showSign="auto" className="text-foreground" />
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[12px] text-faint">No recent activity for this goal.</p>}
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={!!contributionGoal}
        onOpenChange={(open) => {
          if (!open) {
            setContributionGoalId(null)
            setEditContribution('')
          }
        }}
        title={contributionGoal ? `Contribution · ${contributionGoal.name}` : 'Contribution'}
        description="Add a manual contribution without editing goal fields."
      >
        {contributionGoal ? (
          <form
            className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3"
            onSubmit={e => {
              e.preventDefault()
              const parsed = parseContributionAmount(editContribution)
              if (parsed == null || addMut.isPending) return
              addMut.mutate({ goalId: contributionGoal.id, amount: parsed })
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-contribution">Quick contribution</Label>
              <ValueInput id="goal-contribution" value={editContribution} onValueChange={setEditContribution} placeholder="0,00" allowNegative={false} disabled={addMut.isPending} />
            </div>
            <Button type="submit" size="sm" disabled={parseContributionAmount(editContribution) == null || addMut.isPending}>
              {addMut.isPending ? 'Adding...' : 'Add contribution'}
            </Button>
          </form>
        ) : null}
      </AppModal>

      <AppModal
        open={!!withdrawGoal}
        onOpenChange={(open) => {
          if (!open) {
            setWithdrawGoalId(null)
            setEditWithdrawal('')
            setEditWithdrawalReason('')
          }
        }}
        title={withdrawGoal ? `Remove money · ${withdrawGoal.name}` : 'Remove money'}
        description="Remove manual money from goal with reason."
      >
        {withdrawGoal ? (
          <form
            className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3"
            onSubmit={e => {
              e.preventDefault()
              const parsed = parseContributionAmount(editWithdrawal)
              const reason = editWithdrawalReason.trim()
              if (parsed == null || !reason || withdrawMut.isPending) return
              withdrawMut.mutate({ goalId: withdrawGoal.id, amount: parsed, reason })
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-withdrawal">Amount to remove</Label>
              <ValueInput id="goal-withdrawal" value={editWithdrawal} onValueChange={setEditWithdrawal} placeholder="0,00" allowNegative={false} disabled={withdrawMut.isPending} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-withdrawal-reason">Reason</Label>
              <Input id="goal-withdrawal-reason" value={editWithdrawalReason} onChange={e => setEditWithdrawalReason(e.target.value)} placeholder="Why are you removing this money?" disabled={withdrawMut.isPending} />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={parseContributionAmount(editWithdrawal) == null || !editWithdrawalReason.trim() || withdrawMut.isPending}>
              {withdrawMut.isPending ? 'Removing...' : 'Remove money'}
            </Button>
          </form>
        ) : null}
      </AppModal>

      <Skeleton
        name="goals-activity"
        loading={trackingQuery.isLoading}
        fallback={(
          <div className="space-y-3" role="status" aria-label="Loading goals activity">
            <div className="h-24 rounded-md border border-line bg-surface animate-pulse" aria-hidden="true" />
            <span className="sr-only">Loading goals activity...</span>
          </div>
        )}
      >
        <section className="flex flex-col gap-2">
          <p className={eyebrow}>Recent activity</p>
          {activities.length === 0 ? (
            <p className="rounded-md border border-line bg-surface px-3 py-4 text-[12px] text-faint">No recent entries.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line bg-surface">
              <table className={denseTable}>
                <thead>
                  <tr>
                    <th className={denseHead}>Goal</th>
                    <th className={denseHead}>Type</th>
                    <th className={denseHead}>Date</th>
                    <th className={denseHead}>Source</th>
                    <th className={cn(denseHead, 'text-right')}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.slice(0, 6).map(a => (
                    <tr key={a.entry_id} className={denseRow}>
                      <td className={cn(denseCell, 'max-w-[180px] truncate')}>{a.goal_name}</td>
                      <td className={cn(denseCell, 'capitalize text-muted-foreground')}>{a.type}</td>
                      <td className={cn(denseCell, 'text-muted-foreground')}>{formatDate(a.timestamp_utc)}</td>
                      <td className={denseCell}><Badge variant={sourceVariant(a.source)}>{a.source}</Badge></td>
                      <td className={denseNumCell}>
                        <MoneyValue amount={a.amount} currency={currency} tone="neutral" showSign="auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Skeleton>
    </div>
  )
}
