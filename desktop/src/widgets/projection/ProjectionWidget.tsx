import { useState } from 'react'
import { MoneyValue } from '@/components/ui/money-value'
import { formatDate, formatMoney } from '@/lib/format'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { earliestPaydayAfter, nextPaydayAfter, parseDateOnlyUTC } from '@/lib/pay-schedule'
import { computeCustomProjection } from '@/lib/monthly-projection'
import { averageDailySpend, computeBalanceSeries } from '@/lib/balance-series'
import { BalanceChart } from './BalanceChart'
import { CustomProjectionSheet } from '@/components/CustomProjectionSheet'
import { NoPaySchedule } from '@/widgets/payday/PayWindowBar'
import type { CustomProjectionConfig } from '@/components/CustomProjectionSheet'
import type { CustomProjection } from '@/lib/monthly-projection'
import { effectiveAmount } from '@/lib/api'
import { countInCurrentPayWindow, countOccurrences } from '@/lib/occurrences'
import { asNeededForWindow, asNeededReserved, isScheduledBill } from '@/lib/bills'
import type { ReserveAdjustment } from '@/lib/reserve-adjustment'
import type { AccountResponse, FriendDebtBreakdownItem, PayScheduleResponse, TransactionResponse } from '@/lib/api'

interface ProjectionWidgetProps {
  account: AccountResponse
  transactions: TransactionResponse[]
  paySchedules: PayScheduleResponse[]
  friendBreakdown: FriendDebtBreakdownItem[]
  nextPayday: string | null
  /** The reserve, when it is on: the projection is of the money you can spend, so the reserve is left out of it. */
  reserve?: ReserveAdjustment | null
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
  reserve = null,
}: ProjectionWidgetProps) {
  const [mode, setMode] = useState<'window' | 'custom'>('window')
  const [customConfig, setCustomConfig] = useState<CustomProjectionConfig | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  if (paySchedules.length === 0) return <NoPaySchedule />
  if (!nextPayday) return null

  const now = new Date()
  const windowStart = parseDateOnlyUTC(nextPayday)
  // Backend adjusts next_payday backward for weekends/holidays, so windowStart
  // may be 1–2 days before the raw canonical date. Recover that raw date first,
  // then step to the next occurrence — otherwise we get a 1-day window.
  const rawWindowStart = earliestPaydayAfter(paySchedules, new Date(windowStart.getTime() - 1))
  if (!rawWindowStart) return null
  const windowEnd = earliestPaydayAfter(paySchedules, rawWindowStart)
  if (!windowEnd) return null

  const currentRecurringReserved = transactions
    .filter(isScheduledBill)
    .reduce((sum, t) => sum + Math.abs(effectiveAmount(t)) * countInCurrentPayWindow(t, nextPayday), 0)
    + asNeededReserved(transactions)

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

  const projectedStartBalance =
    account.current_balance - (reserve?.balance ?? 0) - currentRecurringReserved - currentInstallmentReserved - currentPeerReserved

  const nextRecurringObligations = transactions
    .filter(isScheduledBill)
    .reduce((sum, t) => sum + Math.abs(effectiveAmount(t)) * countOccurrences(t, windowEnd, windowStart), 0)
    + asNeededForWindow(transactions, windowStart, windowEnd, now, false)

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
  let toReserve = 0
  for (const schedule of paySchedules) {
    let occurrence = nextPaydayAfter(schedule, new Date(windowStart.getTime() - 1))
    let safety = 0
    while (occurrence.getTime() < windowEnd.getTime() && safety < 24) {
      if (occurrence.getTime() >= windowStart.getTime()) {
        incoming += schedule.amount
        toReserve += reserve?.contributionAt(schedule.id, occurrence) ?? 0
      }
      occurrence = nextPaydayAfter(schedule, occurrence)
      safety += 1
    }
  }

  const windowNet = incoming - toReserve - nextObligations
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
      reserve,
    )
  }

  const displayIncome = isCustom ? custom!.income : incoming
  const displayObligations = isCustom ? custom!.obligations : nextObligations
  const displayReserve = isCustom ? custom!.reserveContribution : toReserve
  const displayEndBalance = isCustom ? custom!.projectedEndBalance : windowProjectedEndBalance
  const displayStart = isCustom ? customConfig!.windowStart : windowStart
  const displayEnd = isCustom ? customConfig!.windowEnd : windowEnd

  const dailyBaseline = averageDailySpend(transactions, now)
  const seriesStart = isCustom && customConfig!.windowStart < now ? now : displayStart
  const seriesStartBalance = isCustom
    ? (customConfig!.excludeBalance ? 0 : account.current_balance - (reserve?.balance ?? 0))
    : projectedStartBalance
  const series = displayEnd.getTime() > seriesStart.getTime()
    ? computeBalanceSeries({
        startBalance: seriesStartBalance,
        transactions,
        paySchedules,
        friendBreakdown,
        start: seriesStart,
        end: displayEnd,
        dailyBaseline,
        reserve,
      })
    : null

  return (
    <>
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {formatDate(displayStart.toISOString())} → {formatDate(displayEnd.toISOString())}
        </p>
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
      <div className="space-y-3">
        {series && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint @max-[340px]/widget:hidden">
              <span>
                <i className="mr-1.5 inline-block h-0.5 w-2.5 rounded-sm bg-foreground align-middle" />
                Balance
              </span>
              <span>
                <i className="mr-1.5 inline-block h-0.5 w-2.5 rounded-sm bg-neg align-middle opacity-70" />
                {reserve ? 'Reserve left out' : 'Safety buffer'}
              </span>
              {dailyBaseline > 0 && (
                <span className="ml-auto">
                  includes ~{formatMoney(dailyBaseline, account.currency)}/day average spending
                </span>
              )}
            </div>
            <BalanceChart
              points={series}
              floor={reserve ? 0 : (account.safety_buffer ?? 0)}
              currency={account.currency}
              endsOnPayday={!isCustom}
            />
          </>
        )}

        {mode === 'window' && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Projected start balance{reserve ? ' (without the reserve)' : ''}
            </span>
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
        {reserve && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Set aside for the reserve</span>
            <MoneyValue
              amount={-displayReserve}
              currency={account.currency}
              tone="neutral"
              showSign="always"
            />
          </div>
        )}
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
          <span className={`font-semibold tabular-nums ${displayEndBalance < 0 ? 'text-neg' : 'text-pos'}`}>
            {formatMoney(displayEndBalance, account.currency)}
          </span>
        </div>
      </div>
    </div>
    <CustomProjectionSheet
      open={sheetOpen}
      paySchedules={paySchedules}
      onApply={cfg => { setCustomConfig(cfg); setMode('custom') }}
      onClose={() => setSheetOpen(false)}
    />
    </>
  )
}
