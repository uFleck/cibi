import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createPaySchedule, type CreatePayScheduleRequest } from '@/lib/api'

type Frequency = 'weekly' | 'bi-weekly' | 'monthly'

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-weekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </label>
  )
}

export function PayScheduleForm() {
  const [frequency, setFrequency] = useState<Frequency>('bi-weekly')
  const [anchorDate, setAnchorDate] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [dayOfMonth2, setDayOfMonth2] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!anchorDate) {
      toast.error('Please enter your first pay date')
      return
    }
    if (frequency === 'monthly' && !dayOfMonth) {
      toast.error('Please enter the day of the month')
      return
    }
    if (frequency === 'bi-weekly' && (!dayOfMonth || !dayOfMonth2)) {
      toast.error('Please enter both pay days')
      return
    }

    setSaving(true)
    try {
      const schedule: CreatePayScheduleRequest = {
        account_id: '',
        frequency,
        anchor_date: anchorDate,
        amount: 0,
        day_of_month: dayOfMonth ? parseInt(dayOfMonth, 10) : undefined,
        day_of_month_2: dayOfMonth2 ? parseInt(dayOfMonth2, 10) : undefined,
      }
      await createPaySchedule(schedule)
      toast.success('Pay schedule saved!')
    } catch (err) {
      const error = err as Error
      toast.error(error.message || 'Failed to save pay schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-5">
        Pay Schedule
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <FieldLabel>Frequency</FieldLabel>
          <div className="flex gap-2">
            {FREQUENCIES.map(f => (
              <Button
                key={f.value}
                type="button"
                variant={frequency === f.value ? 'default' : 'outline'}
                onClick={() => setFrequency(f.value)}
                className="flex-1 h-10"
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>First Pay Date</FieldLabel>
          <Input
            type="date"
            value={anchorDate}
            onChange={e => setAnchorDate(e.target.value)}
            className="h-11 bg-muted/50 border-border/60"
          />
        </div>

        {frequency === 'monthly' && (
          <div className="flex flex-col gap-2">
            <FieldLabel>Day of Month (1–31)</FieldLabel>
            <Input
              type="number"
              min="1"
              max="31"
              placeholder="e.g. 15"
              value={dayOfMonth}
              onChange={e => setDayOfMonth(e.target.value)}
              className="h-11 bg-muted/50 border-border/60"
            />
          </div>
        )}

        {frequency === 'bi-weekly' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <FieldLabel>First Day</FieldLabel>
              <Input
                type="number"
                min="1"
                max="31"
                placeholder="e.g. 1"
                value={dayOfMonth}
                onChange={e => setDayOfMonth(e.target.value)}
                className="h-11 bg-muted/50 border-border/60"
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Second Day</FieldLabel>
              <Input
                type="number"
                min="1"
                max="31"
                placeholder="e.g. 15"
                value={dayOfMonth2}
                onChange={e => setDayOfMonth2(e.target.value)}
                className="h-11 bg-muted/50 border-border/60"
              />
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={saving}
          className="w-full h-11 font-semibold cursor-pointer mt-1"
        >
          {saving ? 'Saving…' : 'Save Pay Schedule'}
        </Button>
      </form>
    </div>
  )
}
