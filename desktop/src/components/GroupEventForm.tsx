import { Button } from '@/components/ui/button'
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
  submitLabel = 'Create Event',
  cancelLabel = 'Discard',
}: GroupEventFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Label className="block text-sm font-medium mb-1">Title</Label>
        <Input
          required
          value={form.title}
          onChange={e => onChange({ ...form, title: e.target.value })}
          placeholder="Pizza Night"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="block text-sm font-medium mb-1">Date</Label>
          <Input
            type="date"
            required
            value={form.date}
            onChange={e => onChange({ ...form, date: e.target.value })}
          />
        </div>
        <div>
          <Label className="block text-sm font-medium mb-1">Total Amount ($)</Label>
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
        <Label className="block text-sm font-medium mb-1">Notes (optional)</Label>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={e => onChange({ ...form, notes: e.target.value })}
          placeholder="Optional notes"
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
