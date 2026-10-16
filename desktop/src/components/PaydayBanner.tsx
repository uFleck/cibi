import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePayScheduleMutations } from '@/hooks/usePayScheduleMutations'
import type { PayScheduleResponse } from '@/lib/api'

/** Shown on payday: one button per schedule that pays today. */
export function PaydayBanner({ schedules }: { schedules: PayScheduleResponse[] }) {
  const { confirm } = usePayScheduleMutations()
  const today = new Date().toISOString().slice(0, 10)
  const due = schedules.filter(ps => ps.next_payday === today)

  if (due.length === 0) return null

  return (
    <div className="rounded-md border border-pos/30 bg-pos/10 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <p className="font-medium text-sm">Payday today</p>
        <p className="text-xs text-muted-foreground">{due.map(ps => ps.label ?? ps.frequency).join(', ')}</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {due.map(ps => (
          <Button
            key={ps.id}
            size="sm"
            variant="outline"
            className="border-pos/40 hover:bg-pos/20"
            onClick={() => confirm.mutate(ps.id)}
            disabled={confirm.isPending}
          >
            <Check size={14} />
            Mark received{due.length > 1 ? ` (${ps.label ?? ps.frequency})` : ''}
          </Button>
        ))}
      </div>
    </div>
  )
}
