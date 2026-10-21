import { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Skeleton } from 'boneyard-js/react'
import { AccountContext } from '@/App'
import { fetchAccounts, fetchGoalsTracking, type GoalsTrackingGoalResponse } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoneyValue } from '@/components/ui/money-value'
import { progressTone } from '@/pages/goals-helpers'

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(100, progress))
}

interface GoalMoneyCellProps {
  label: string
  amount: number
  currency: string
}

function GoalMoneyCell({ label, amount, currency }: GoalMoneyCellProps) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums text-foreground">
        {Number.isFinite(amount) ? (
          <MoneyValue amount={amount} currency={currency} tone="neutral" showSign="never" className="text-foreground" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>
    </div>
  )
}

interface DashboardGoalCardProps {
  goal: GoalsTrackingGoalResponse
  currency: string
}

function DashboardGoalCard({ goal, currency }: DashboardGoalCardProps) {
  const progress = clampProgress(goal.progress_pct)
  const toneClass = progressTone(progress)

  return (
    <article className="rounded-xl border border-border/60 bg-card p-3 shadow-sm" aria-label={`Resumo da meta ${goal.name}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex flex-col gap-1">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">{goal.name}</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Meta do painel</p>
          </div>
          <Badge variant="secondary" className="capitalize">{goal.status}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <GoalMoneyCell label="Investido" amount={goal.invested_total} currency={currency} />
          <GoalMoneyCell label="Restante" amount={goal.remaining_amount} currency={currency} />
        </div>

        <div className="flex flex-col gap-2" aria-label={`Progresso de ${goal.name}`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">Progresso</span>
            <span className="font-semibold tabular-nums text-foreground">{progress.toFixed(1)}%</span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-muted shadow-inner"
            role="progressbar"
            aria-label={`Progresso de ${goal.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(progress.toFixed(1))}
          >
            <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </article>
  )
}

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
  const emptyState = !trackingQuery.isLoading && !trackingQuery.isError && goals.length === 0

  return (
    <div aria-label="Resumo das metas" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Resumo das metas</p>
            <p className="text-sm font-semibold tracking-tight text-foreground">Metas mais urgentes</p>
          </div>
          <Button size="xs" variant="ghost" onClick={() => navigate({ to: '/goals' })}>Ver todas</Button>
        </div>

        {trackingQuery.isError ? (
          <Card className="border-destructive/30 bg-destructive/5 py-0 shadow-none" role="alert" aria-label="Erro no resumo das metas">
            <CardContent className="py-3 flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
              <div className="min-w-0 flex flex-col gap-1">
                <p className="text-sm font-medium text-destructive">Não deu para carregar as metas.</p>
                <p className="text-xs text-muted-foreground">Tente de novo sem alterar os dados do painel.</p>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => void trackingQuery.refetch()}
                className="w-fit border-destructive/30 text-destructive hover:text-destructive"
              >
                Tentar de novo
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Skeleton
          name="goals-widget"
          loading={trackingQuery.isLoading}
          fallback={(
            <div className="space-y-2" role="status" aria-label="Carregando resumo das metas">
              <div className="h-28 rounded-xl border border-border/40 bg-card/60 animate-pulse" aria-hidden="true" />
              <span className="sr-only">Carregando resumo das metas...</span>
            </div>
          )}
        >
          {emptyState ? (
            <Card className="border-border/60 bg-muted/20 py-0 shadow-none">
              <CardContent className="py-5 text-center flex flex-col gap-2 items-center">
                <p className="text-sm font-semibold text-foreground">Nenhuma meta ainda</p>
                <p className="max-w-[24rem] text-xs text-muted-foreground text-pretty">
                  Abra Metas para criar seu primeiro objetivo e acompanhar progresso, dinheiro e impacto de compras.
                </p>
                <Button size="xs" onClick={() => navigate({ to: '/goals' })}>Nova meta</Button>
              </CardContent>
            </Card>
          ) : !trackingQuery.isError ? (
            <div className="flex flex-col gap-2" aria-label="Cartões de resumo das metas">
              {goals.map(goal => <DashboardGoalCard key={goal.id} goal={goal} currency={currency} />)}
            </div>
          ) : null}
        </Skeleton>

    </div>
  )
}
