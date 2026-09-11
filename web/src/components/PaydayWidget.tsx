import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PartyPopper } from 'lucide-react'
import { recordIncome, type AccountResponse, type PayScheduleResponse } from '@/lib/api'
import { nextPaydayAfter } from '@/lib/pay-schedule'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  account: AccountResponse
  paySchedules: PayScheduleResponse[]
}

function isSameDateUTC(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

export function PaydayWidget({ account, paySchedules }: Props) {
  const queryClient = useQueryClient()
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const today = new Date()
  const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  const dueSchedules = paySchedules.filter(schedule => {
    const next = nextPaydayAfter(schedule, yesterday)
    return isSameDateUTC(next, todayUTC)
  })

  const { mutate: markReceived } = useMutation({
    mutationFn: (schedule: PayScheduleResponse) =>
      recordIncome({
        account_id: account.id,
        pay_schedule_id: schedule.id,
        amount: schedule.amount,
        description: `${schedule.label ?? 'Payday'} received`,
      }),
    onMutate: (schedule) => {
      setPendingIds(prev => new Set(prev).add(schedule.id))
    },
    onSuccess: (_data, schedule) => {
      setPendingIds(prev => {
        const next = new Set(prev)
        next.delete(schedule.id)
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['ledger', account.id] })
      toast.success('Income recorded')
    },
    onError: (_err, schedule) => {
      setPendingIds(prev => {
        const next = new Set(prev)
        next.delete(schedule.id)
        return next
      })
      toast.error('Failed to record income')
    },
  })

  if (dueSchedules.length === 0) return null

  return (
    <Card className="border-green-500/40 bg-green-500/5">
      <CardContent className="py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <PartyPopper size={18} className="text-green-600 shrink-0" />
          <p className="font-semibold text-sm">Payday</p>
        </div>
        {dueSchedules.map(schedule => (
          <div key={schedule.id} className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {schedule.label ?? 'Pay schedule'} ·{' '}
              {formatMoney(schedule.amount, account.currency)}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-green-500/40 text-green-700 hover:bg-green-500/10 shrink-0"
              onClick={() => markReceived(schedule)}
              disabled={pendingIds.has(schedule.id)}
            >
              Mark as received
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
