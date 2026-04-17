import { MoneyValue } from '@/components/ui/money-value'
import { formatDate } from '@/lib/format'
import type { PayScheduleResponse } from '@/lib/api'

interface PayScheduleListProps {
  schedules: PayScheduleResponse[]
  currency?: string
}

export function PayScheduleList({ schedules, currency = 'BRL' }: PayScheduleListProps) {
  if (schedules.length === 0) return null

  const sorted = [...schedules].sort((a, b) => a.next_payday.localeCompare(b.next_payday))
  const total = sorted.reduce((sum, ps) => sum + ps.amount, 0)

  return (
    <div className="rounded-xl border border-border/60 bg-card flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Upcoming Paychecks
        </p>
      </div>

      <div className="flex flex-col">
        {sorted.map(ps => (
          <div
            key={ps.id}
            className="flex items-center px-5 py-2.5 gap-4 hover:bg-muted/30 transition-colors"
          >
            <span className="flex-1 text-sm">{ps.label ?? ps.frequency}</span>
            <MoneyValue
              amount={ps.amount}
              currency={currency}
              tone="positive"
              showSign="always"
              className="text-sm font-medium"
            />
            <span className="text-xs text-muted-foreground w-14 text-right tabular-nums">
              {formatDate(ps.next_payday)}
            </span>
          </div>
        ))}
        <div className="mx-5 border-t border-border/40 mt-1" />
        <div className="flex items-center px-5 py-3 gap-4">
          <span className="flex-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Total incoming
          </span>
          <MoneyValue
            amount={total}
            currency={currency}
            tone="positive"
            showSign="never"
            className="text-sm font-semibold"
          />
        </div>
      </div>
    </div>
  )
}
