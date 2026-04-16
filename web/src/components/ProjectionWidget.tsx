import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatDate, formatMoney } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { earliestPaydayAfter, nextPaydayAfter, parseDateOnlyUTC } from '@/lib/pay-schedule'
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

  const currentPeerReserved = friendBreakdown.reduce((sum, debt) => {
    if (!debt.next_payment_date) return sum + debt.next_payment
    if (isInCurrentPayWindow(debt.next_payment_date, now, nextPayday)) {
      return sum + debt.next_payment
    }
    return sum
  }, 0)

  const projectedStartBalance = account.current_balance - currentRecurringReserved - currentPeerReserved

  const nextRecurringObligations = transactions
    .filter(t => t.is_recurring && t.next_occurrence !== null && isInWindow(t.next_occurrence, windowStart, windowEnd))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const nextPeerObligations = friendBreakdown
    .filter(d => d.next_payment_date !== null && isInWindow(d.next_payment_date, windowStart, windowEnd))
    .reduce((sum, d) => sum + d.next_payment, 0)

  const nextObligations = nextRecurringObligations + nextPeerObligations

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

  const net = incoming - nextObligations
  const projectedEndBalance = projectedStartBalance + net

  const chartData = [
    { name: 'Incoming', value: incoming, fill: 'var(--color-verdict-yes)' },
    { name: 'Obligations', value: -nextObligations, fill: 'var(--color-verdict-no)' },
    { name: 'Net', value: net, fill: net >= 0 ? 'var(--color-verdict-yes)' : 'var(--color-verdict-no)' },
  ]

  const chartConfig = {
    value: { label: 'Amount' },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Projection</CardTitle>
        <p className="text-xs text-muted-foreground">
          {formatDate(windowStart.toISOString())} → {formatDate(windowEnd.toISOString())}
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

        <div className="flex justify-between">
          <span className="text-muted-foreground">Projected start balance</span>
          <span className="tabular-nums">{formatMoney(projectedStartBalance, account.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Incoming</span>
          <span className="tabular-nums text-green-600">+{formatMoney(incoming, account.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Obligations</span>
          <span className="tabular-nums text-red-500">-{formatMoney(nextObligations, account.currency).replace('-', '')}</span>
        </div>
        <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1">
          <span className="font-semibold">Projected end balance</span>
          <span className={`font-semibold tabular-nums ${projectedEndBalance < 0 ? 'text-red-500' : 'text-green-600'}`}>
            {formatMoney(projectedEndBalance, account.currency)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
