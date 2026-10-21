import { MoneyValue } from '@/components/ui/money-value'
import { formatDate } from '@/lib/format'
import type { PayScheduleResponse } from '@/lib/api'
import { frequencyLabel } from '@/lib/labels'

interface PayScheduleListProps {
  schedules: PayScheduleResponse[]
  currency?: string
}

export function PayScheduleList({ schedules, currency = 'BRL' }: PayScheduleListProps) {
  if (schedules.length === 0) return null

  const sorted = [...schedules].sort((a, b) => a.next_payday.localeCompare(b.next_payday))
  const total = sorted.reduce((sum, ps) => sum + ps.amount, 0)

  return (
    <div className="flex flex-col">
      <div className="pb-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Upcoming Paychecks
        </p>
      </div>

      <div className="flex flex-col">
        {sorted.map(ps => (
          <div
            key={ps.id}
            className="flex items-center py-2 gap-4 hover:bg-muted/30 transition-colors"
          >
            <span className="flex-1 text-sm">{ps.label ?? frequencyLabel(ps.frequency)}</span>
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
        <div className="border-t border-line mt-1" />
        <div className="flex items-center py-2 gap-4">
          <span className="flex-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Total de entradas
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
