import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { APP_LOCALE } from '@/lib/locale'
import { formatMoney } from '@/lib/format'
import {
  addBudgetExclusion,
  fetchBudget,
  removeBudgetExclusion,
  type BudgetResponse,
  type BudgetRow,
  type BudgetStatus,
  type ScheduledBill,
} from '@/lib/api'
import { requestShellAction } from '@/shell/shellActions'
import { cn } from '@/lib/utils'
import { useBudgetMonth } from './useBudgetMonth'

const STATUS_LABEL: Record<BudgetStatus, string> = {
  over: 'Over budget',
  ahead: 'Ahead of pace',
  ok: 'On track',
}

const STATUS_TEXT: Record<BudgetStatus, string> = {
  over: 'text-neg',
  ahead: 'text-hl',
  ok: 'text-muted-foreground',
}

const STATUS_FILL: Record<BudgetStatus, string> = {
  over: 'bg-neg',
  ahead: 'bg-hl',
  ok: 'bg-muted-foreground',
}

function segments(spent: number, scheduled: number, limit: number) {
  if (limit <= 0) return { spent: 0, scheduled: 0 }
  const spentPct = Math.min(100, (spent / limit) * 100)
  const scheduledPct = Math.min(100 - spentPct, (scheduled / limit) * 100)
  return { spent: spentPct, scheduled: scheduledPct }
}

function clampPct(ratio: number) {
  return Math.min(100, Math.max(0, ratio * 100))
}

function shortMonth(month: string) {
  const [year, index] = month.split('-').map(Number)
  return new Date(year, index - 1, 1).toLocaleDateString(APP_LOCALE, { month: 'short' })
}

function dueDay(dueDate: string) {
  const [, month, day] = dueDate.split('-')
  return `${day}/${month}`
}

function BarSegments({ spent, scheduled, limit, fill }: { spent: number; scheduled: number; limit: number; fill: string }) {
  const pct = segments(spent, scheduled, limit)
  return (
    <>
      <span className={cn('h-full', fill)} style={{ width: `${pct.spent}%` }} />
      <span className={cn('h-full opacity-40', fill)} style={{ width: `${pct.scheduled}%` }} />
    </>
  )
}

function PaceTick({ ratio }: { ratio: number }) {
  return (
    <span
      aria-hidden
      data-testid="pace-tick"
      className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground opacity-50"
      style={{ left: `${clampPct(ratio)}%` }}
    />
  )
}

export function BudgetWidget({ currency }: { currency: string }) {
  const month = useBudgetMonth()
  const queryClient = useQueryClient()
  const [billsOpen, setBillsOpen] = useState(false)
  const billsPanelId = useId()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['budget', month],
    queryFn: () => fetchBudget(month),
  })

  const toggleBill = useMutation({
    mutationFn: ({ transactionId, exclude }: { transactionId: string; exclude: boolean }) =>
      exclude ? addBudgetExclusion(transactionId, month) : removeBudgetExclusion(transactionId, month),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading budget...</p>
  if (isError || !data) return <p className="text-sm text-muted-foreground">Could not load budget.</p>

  const money = (cents: number) => formatMoney(cents / 100, currency)
  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{shortMonth(data.month)}</span>
      <Button variant="ghost" size="sm" onClick={() => requestShellAction('open-budget')}>
        Edit
      </Button>
    </div>
  )

  const budgeted = data.rows.filter(row => row.limit !== null)
  if (budgeted.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <p className="text-sm text-muted-foreground">Set monthly limits to track spending against your budget.</p>
        <div>
          <Button size="sm" onClick={() => requestShellAction('open-budget')}>
            Set limits
          </Button>
        </div>
      </div>
    )
  }

  const rows: BudgetRow[] = [...budgeted, ...data.rows.filter(row => row.limit === null)]
  const { totals, pace } = data

  return (
    <div className="flex flex-col gap-3">
      {header}
      <SummaryFigures data={data} money={money} />
      <div className="flex flex-col gap-1">
        <div className="relative flex h-2 overflow-hidden rounded-full bg-surface-3">
          <BarSegments spent={totals.spent} scheduled={totals.scheduled} limit={totals.limit} fill={totals.left < 0 ? 'bg-neg' : 'bg-hl'} />
          <PaceTick ratio={pace.ratio} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-0.5 rounded-full bg-foreground opacity-50" />
            Today
          </span>
          <span className="font-mono">of {money(totals.limit)}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map(row => (
          <BudgetRowItem key={row.category} row={row} ratio={pace.ratio} money={money} />
        ))}
      </ul>
      <BillsDisclosure
        bills={data.bills}
        scheduledTotal={totals.scheduled}
        money={money}
        open={billsOpen}
        onToggle={() => setBillsOpen(open => !open)}
        panelId={billsPanelId}
        pending={toggleBill.isPending}
        failed={toggleBill.isError}
        onToggleBill={(bill, exclude) => toggleBill.mutate({ transactionId: bill.transactionId, exclude })}
      />
    </div>
  )
}

function SummaryFigures({ data, money }: { data: BudgetResponse; money: (cents: number) => string }) {
  const { totals } = data
  return (
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
      <Figure label="Spent" value={money(totals.spent)} />
      <Figure label="Scheduled" value={money(totals.scheduled)} />
      <Figure
        label="Left"
        value={money(totals.left)}
        className="col-span-2 @md:col-span-1"
        valueClassName={totals.left < 0 ? 'text-neg' : undefined}
      />
    </div>
  )
}

function Figure({ label, value, className, valueClassName }: { label: string; value: string; className?: string; valueClassName?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('whitespace-nowrap font-mono text-[15px] font-medium tracking-tight', valueClassName)}>{value}</span>
    </div>
  )
}

function BudgetRowItem({ row, ratio, money }: { row: BudgetRow; ratio: number; money: (cents: number) => string }) {
  const { category, limit, isFixed, spent, scheduled, status } = row
  const hasLimit = limit !== null

  return (
    <li className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-2.5 @md:grid-cols-[minmax(0,9rem)_1fr_auto] @md:gap-3">
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate">{category}</span>
          {isFixed && <Badge variant="secondary">Fixed</Badge>}
        </div>
        {status && <span className={cn('text-[11px]', STATUS_TEXT[status])}>{STATUS_LABEL[status]}</span>}
      </div>
      {hasLimit ? (
        <div className="relative flex h-1.5 overflow-hidden rounded-full bg-surface-3">
          <BarSegments spent={spent} scheduled={scheduled} limit={limit} fill={status ? STATUS_FILL[status] : 'bg-hl'} />
          <PaceTick ratio={ratio} />
        </div>
      ) : (
        <span />
      )}
      <span className="whitespace-nowrap font-mono text-xs">
        {hasLimit ? (
          <>
            {money(spent + scheduled)}
            <span className="text-faint"> of {money(limit)}</span>
          </>
        ) : (
          money(spent)
        )}
      </span>
    </li>
  )
}

interface BillsDisclosureProps {
  bills: ScheduledBill[]
  scheduledTotal: number
  money: (cents: number) => string
  open: boolean
  onToggle: () => void
  panelId: string
  pending: boolean
  failed: boolean
  onToggleBill: (bill: ScheduledBill, exclude: boolean) => void
}

function BillsDisclosure({ bills, scheduledTotal, money, open, onToggle, panelId, pending, failed, onToggleBill }: BillsDisclosureProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex items-center justify-between gap-2 text-left text-sm"
      >
        <span>
          Scheduled bills <span className="text-xs text-muted-foreground">({bills.length})</span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">{money(scheduledTotal)}</span>
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-1.5">
          {bills.length === 0 && <p className="text-sm text-muted-foreground">No scheduled bills this month.</p>}
          {bills.map(bill => (
            <label key={bill.transactionId} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`Count ${bill.title}`}
                checked={!bill.excluded}
                disabled={pending}
                onChange={event => onToggleBill(bill, !event.target.checked)}
                className="size-3.5 accent-hl"
              />
              <span className={cn('truncate', bill.excluded && 'text-muted-foreground line-through')}>{bill.title}</span>
              <span className="font-mono text-xs text-muted-foreground">{dueDay(bill.dueDate)}</span>
              <span className={cn('font-mono text-xs', bill.excluded && 'text-muted-foreground line-through')}>{money(bill.amount)}</span>
            </label>
          ))}
          {failed && <p className="text-xs text-neg">Could not update the bill. Try again.</p>}
        </div>
      )}
    </div>
  )
}
