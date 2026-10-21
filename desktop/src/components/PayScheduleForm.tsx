import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createPaySchedule, type CreatePayScheduleRequest } from '@/lib/api'

type Frequency = 'weekly' | 'bi-weekly' | 'monthly'

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'bi-weekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
]

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
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
      toast.error('Informe a data do primeiro recebimento')
      return
    }
    if (frequency === 'monthly' && !dayOfMonth) {
      toast.error('Informe o dia do mês')
      return
    }
    if (frequency === 'bi-weekly' && (!dayOfMonth || !dayOfMonth2)) {
      toast.error('Informe os dois dias de recebimento')
      return
    }

    setSaving(true)
    try {
      const schedule: CreatePayScheduleRequest = {
        account_id: '',
        frequency,
        anchor_date: anchorDate,
        amount: 0,
        day_of_month_2: dayOfMonth2 ? parseInt(dayOfMonth2, 10) : undefined,
      }
      await createPaySchedule(schedule)
      toast.success('Recebimento salvo!')
    } catch (err) {
      const error = err as Error
      toast.error(error.message || 'Não deu para salvar o recebimento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-5">
        Recebimento
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <FieldLabel>Frequência</FieldLabel>
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
          <FieldLabel>Data do primeiro recebimento</FieldLabel>
          <DateInput
            value={anchorDate}
            onChange={setAnchorDate}
            className="h-11 bg-muted/50 border-border/60"
          />
        </div>

        {frequency === 'monthly' && (
          <div className="flex flex-col gap-2">
            <FieldLabel>Dia do mês (1–31)</FieldLabel>
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
              <FieldLabel>Primeiro dia</FieldLabel>
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
              <FieldLabel>Segundo dia</FieldLabel>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              disabled={saving}
              className="w-full h-11 font-semibold cursor-pointer mt-1"
            >
              {saving ? 'Salvando…' : 'Salvar recebimento'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Salvar o recebimento</p>
          </TooltipContent>
        </Tooltip>
      </form>
    </div>
  )
}
