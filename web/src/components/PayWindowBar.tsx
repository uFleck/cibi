import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { formatDate } from '@/lib/format'
import { earliestPaydayAfter, nextPaydayAfter, parseDateOnlyUTC } from '@/lib/pay-schedule'
import type { PayScheduleResponse } from '@/lib/api'

interface PayWindowBarProps {
  nextPayday: string | null
  paySchedules: PayScheduleResponse[]
}

function getPreviousPayday(schedule: PayScheduleResponse): Date | null {
  const nextStart = parseDateOnlyUTC(schedule.next_payday)
  const prev = new Date(nextStart.getTime() - 1)

  switch (schedule.frequency) {
    case 'weekly':
      prev.setUTCDate(prev.getUTCDate() - 7)
      break
    case 'bi-weekly':
      prev.setUTCDate(prev.getUTCDate() - 14)
      break
    case 'semi-monthly':
      prev.setUTCDate(prev.getUTCDate() - 15)
      break
    case 'monthly':
      prev.setUTCMonth(prev.getUTCMonth() - 1)
      break
    default:
      prev.setUTCMonth(prev.getUTCMonth() - 1)
  }
  return parseDateOnlyUTC(prev.toISOString().slice(0, 10))
}

export function PayWindowBar({ nextPayday, paySchedules }: PayWindowBarProps) {
  const [expanded, setExpanded] = useState(false)

  if (!nextPayday || paySchedules.length === 0) return null

  const primary = paySchedules.reduce(
    (earliest, ps) => (ps.next_payday < earliest.next_payday ? ps : earliest),
    paySchedules[0],
  )

  const nextPaydayDate = parseDateOnlyUTC(nextPayday)
  const prevPayday = getPreviousPayday(primary)
  const now = new Date()

  // Percentage through window
  let progress = 0
  if (prevPayday) {
    const totalMs = nextPaydayDate.getTime() - prevPayday.getTime()
    const elapsedMs = now.getTime() - prevPayday.getTime()
    progress = totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 0
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil((nextPaydayDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  )

  // Total expected income in next window
  const nextWindowEnd = earliestPaydayAfter(paySchedules, nextPaydayDate)
  let incoming = 0
  if (nextWindowEnd) {
    for (const schedule of paySchedules) {
      let occurrence = nextPaydayAfter(schedule, new Date(nextPaydayDate.getTime() - 1))
      let safety = 0
      while (occurrence.getTime() < nextWindowEnd.getTime() && safety < 24) {
        if (occurrence.getTime() >= nextPaydayDate.getTime()) incoming += schedule.amount
        occurrence = nextPaydayAfter(schedule, occurrence)
        safety += 1
      }
    }
  }

  const prevLabel = prevPayday ? formatDate(prevPayday.toISOString()) : '?'
  const nextLabel = formatDate(nextPayday)

  return (
    <Card className="border-border/60 py-0 shadow-sm">
      <CardContent className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Pay Window
            </p>
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} until next payday
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse pay window details' : 'Expand pay window details'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Payday: {prevLabel}</span>
            <span>Next: {nextLabel}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted shadow-inner">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center text-[10px] text-muted-foreground">
            Today ({progress.toFixed(0)}%)
          </div>
        </div>

        {expanded && (
          <div className="flex flex-col gap-2 pt-1 border-t border-border/40">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Days remaining</span>
              <span className="tabular-nums font-medium">{daysRemaining}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Next income</span>
              <MoneyValue
                amount={primary.amount}
                tone="positive"
                showSign="always"
                className="font-medium"
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Window total</span>
              <MoneyValue
                amount={incoming}
                tone="positive"
                showSign="always"
                className="font-medium"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
