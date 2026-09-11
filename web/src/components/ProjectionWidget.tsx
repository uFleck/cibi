import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { MoneyValue } from '@/components/ui/money-value'
import { formatDate, formatMoney } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { earliestPaydayAfter, nextPaydayAfter, parseDateOnlyUTC } from '@/lib/pay-schedule'
import { computeCustomProjection } from '@/lib/monthly-projection'
import { CustomProjectionSheet } from '@/components/CustomProjectionSheet'
import type { CustomProjectionConfig } from '@/components/CustomProjectionSheet'
import type { CustomProjection } from '@/lib/monthly-projection'
import type { AccountResponse, FriendDebtBreakdownItem, PayScheduleResponse, TransactionResponse } from '@/lib/api'
import type { ChartConfig } from '@/components/ui/chart'

interface ProjectionWidgetProps {
  account: AccountResponse
  transactions: TransactionResponse[]
  paySchedules: PayScheduleResponse[]
  friendBreakdown: FriendDebtBreakdownItem[]
  nextPayday: string | null
}

function isInWindow(occurrence: string, start: Date, end: Date): boolean {
  const date = new Date(occurrence)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime()
}

export function ProjectionWidget({
  account,
  transactions,
  paySchedules,
  friendBreakdown,
  nextPayday,
}: ProjectionWidgetProps) {
  const [mode, setMode] = useState<'window' | 'custom'>('window')
  const [customConfig, setCustomConfig] = useState<CustomProjectionConfig | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  if (!nextPayday || paySchedules.length === 0) return null

  const now = new Date()
  const windowStart = parseDateOnlyUTC(nextPayday)
  const windowEnd = earliestPaydayAfter(paySchedules, windowStart)
  if (!windowEnd) return null

  const currentRecurringReserved = transactions
    .filter(
      t => t.is_recurring && t.next_occurrence !== null
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const currentInstallmentReserved = transactions
    .filter(
      t => t.is_installment && t.next_occurrence !== null
        && t.amount < 0
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const currentPeerReserved = friendBreakdown.reduce((sum, debt) => {
    if (!debt.next_payment_date) return sum + debt.next_payment
    if (isInCurrentPayWindow(debt.next_payment_date, now, nextPayday)) {
      return sum + debt.next_payment
    }
    return sum
  }, 0)

  const projectedStartBalance = account.current_balance - currentRecurringReserved - currentInstallmentReserved - currentPeerReserved

  const nextRecurringObligations = transactions
    .filter(t => t.is_recurring && t.next_occurrence !== null && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const nextInstallmentObligations = transactions
    .filter(t => t.is_installment && t.next_occurrence !== null
      && t.amount < 0
      && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const nextPeerObligations = friendBreakdown
    .filter(d => d.next_payment_date !== null && isInWindow(d.next_payment_date, windowStart, windowEnd))
    .reduce((sum, d) => sum + d.next_payment, 0)

  const nextObligations = nextRecurringObligations + nextInstallmentObligations + nextPeerObligations

  let incoming = 0
  for (const schedule of paySchedules) {
    let occurrence = nextPaydayAfter(schedule, new Date(windowStart.getTime() - 1))
    let safety = 0
    while (occurrence.getTime() < windowEnd.getTime() && safety < 24) {
      if (occurrence.getTime() >= windowStart.getTime()) incoming += schedule.amount
      occurrence = nextPaydayAfter(schedule, occurrence)
      safety += 1
    }
  }

  const windowNet = incoming - nextObligations
  const windowProjectedEndBalance = projectedStartBalance + windowNet

  const isCustom = mode === 'custom' && customConfig !== null
  let custom: CustomProjection | null = null
  if (isCustom) {
    custom = computeCustomProjection(
      account,
      transactions,
      paySchedules,
      friendBreakdown,
      customConfig.windowStart,
      customConfig.windowEnd,
      customConfig.excludeBalance,
    )
  }

  const displayIncome = isCustom ? custom!.income : incoming
  const displayRecurring = isCustom ? 0 : nextRecurringObligations
  const displayInstallments = isCustom ? 0 : nextInstallmentObligations
  const displayPeer = isCustom ? 0 : nextPeerObligations
  const displayObligations = isCustom ? custom!.obligations : nextObligations
  const displayNet = isCustom ? custom!.net : windowNet
  const displayEndBalance = isCustom ? custom!.projectedEndBalance : windowProjectedEndBalance
  const displayStart = isCustom ? customConfig!.windowStart : windowStart
  const displayEnd = isCustom ? customConfig!.windowEnd : windowEnd

  const chartData = isCustom
    ? [
        { name: 'Income', value: displayIncome, fill: 'var(--color-verdict-yes)' },
        { name: 'Bills', value: -displayObligations, fill: 'var(--color-verdict-no)' },
        { name: 'Net', value: displayNet, fill: displayNet >= 0 ? 'var(--color-verdict-yes)' : 'var(--color-verdict-no)' },
      ]
    : [
        { name: 'Income', value: displayIncome, fill: 'var(--color-verdict-yes)' },
        { name: 'Bills', value: -displayRecurring, fill: 'var(--color-verdict-no)' },
        ...(displayInstallments > 0 ? [{ name: 'Installments', value: -displayInstallments, fill: 'var(--color-risk-medium)' }] : []),
        ...(displayPeer > 0 ? [{ name: 'Peer debts', value: -displayPeer, fill: 'var(--color-risk-medium)' }] : []),
        { name: 'Net', value: displayNet, fill: displayNet >= 0 ? 'var(--color-verdict-yes)' : 'var(--color-verdict-no)' },
      ]

  const chartConfig = {
    value: { label: 'Amount' },
  } satisfies ChartConfig

  return (
    <>
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Projection</CardTitle>
          <div className="flex rounded-md border border-border/60 text-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('window')}
              className={`px-2.5 py-1 transition-colors ${mode === 'window' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Next window
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className={`px-2.5 py-1 transition-colors border-l border-border/60 ${mode === 'custom' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Custom
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDate(displayStart.toISOString())} → {formatDate(displayEnd.toISOString())}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ChartContainer config={chartConfig} className="h-36 w-full">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={8} fontSize={11} />
            <YAxis hide domain={['auto', 'auto']} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={value => formatMoney(Number(value), account.currency)}
                />
              }
            />
            <Bar dataKey="value" radius={6}>
              {chartData.map(point => (
                <Cell key={point.name} fill={point.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>

        {mode === 'window' && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Projected start balance</span>
            <span className="tabular-nums">{formatMoney(projectedStartBalance, account.currency)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Incoming</span>
          <MoneyValue
            amount={displayIncome}
            currency={account.currency}
            tone="positive"
            showSign="always"
          />
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Obligations</span>
          <MoneyValue
            amount={-displayObligations}
            currency={account.currency}
            tone="negative"
            showSign="always"
          />
        </div>
        <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1">
          <span className="font-semibold">Projected end balance</span>
          <span className={`font-semibold tabular-nums ${displayEndBalance < 0 ? 'text-red-500' : 'text-green-600'}`}>
            {formatMoney(displayEndBalance, account.currency)}
          </span>
        </div>
      </CardContent>
    </Card>
    <CustomProjectionSheet
      open={sheetOpen}
      paySchedules={paySchedules}
      onApply={cfg => { setCustomConfig(cfg); setMode('custom') }}
      onClose={() => setSheetOpen(false)}
    />
    </>
  )
}
