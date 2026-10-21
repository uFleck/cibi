import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ValueInput } from '@/components/ui/value-input'

export interface GroupEventFormState {
  title: string
  date: string
  total_amount: string
  notes: string
}

export interface GroupEventFormProps {
  form: GroupEventFormState
  onChange: (next: GroupEventFormState) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  isSubmitting?: boolean
  submitLabel?: string
  cancelLabel?: string
}

export function GroupEventForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = 'Criar evento',
  cancelLabel = 'Descartar',
}: GroupEventFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Label className="block text-sm font-medium mb-1">Título</Label>
        <Input
          required
          value={form.title}
          onChange={e => onChange({ ...form, title: e.target.value })}
          placeholder="Jantar de pizza"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="block text-sm font-medium mb-1">Data</Label>
          <DateInput
            required
            value={form.date}
            onChange={date => onChange({ ...form, date })}
          />
        </div>
        <div>
          <Label className="block text-sm font-medium mb-1">Valor total ($)</Label>
          <ValueInput
            required
            value={form.total_amount}
            onValueChange={value => onChange({ ...form, total_amount: value })}
            placeholder="0.00"
            allowNegative={false}
          />
        </div>
      </div>
      <div>
        <Label className="block text-sm font-medium mb-1">Observações (opcional)</Label>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={e => onChange({ ...form, notes: e.target.value })}
          placeholder="Observações opcionais"
          className="resize-none"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  )
}
