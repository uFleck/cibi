import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ValueInput } from '@/components/ui/value-input'

export interface DebtFormState {
  description: string
  amount: string
  date: string
  is_installment: boolean
  total_installments: string
  frequency: 'weekly' | 'monthly'
}

export interface DebtFormProps {
  friendId: string
  form: DebtFormState
  onChange: (next: DebtFormState) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
  isSubmitting?: boolean
  submitLabel?: string
  cancelLabel?: string
  title?: string
}

export function DebtForm({
  friendId,
  form,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = 'Add',
  cancelLabel = 'Cancel',
  title = 'Add Debt',
}: DebtFormProps) {
  return (
    <form onSubmit={onSubmit} className="border rounded-md p-3 space-y-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input
          required
          value={form.description}
          onChange={e => onChange({ ...form, description: e.target.value })}
          placeholder="Description"
        />
        <ValueInput
          required
          value={form.amount}
          onValueChange={value => onChange({ ...form, amount: value })}
          placeholder="Amount"
          allowNegative
          showSignToggle
        />
        <Input
          required
          type="date"
          value={form.date}
          onChange={e => onChange({ ...form, date: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id={`debt-installment-${friendId}`}
          checked={form.is_installment}
          onCheckedChange={checked => onChange({ ...form, is_installment: checked })}
        />
        <Label htmlFor={`debt-installment-${friendId}`} className="cursor-pointer">
          Paid in installments
        </Label>
      </div>

      {form.is_installment && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            required
            type="number"
            min="1"
            value={form.total_installments}
            onChange={e => onChange({ ...form, total_installments: e.target.value })}
            placeholder="Total installments"
          />
          <Select
            value={form.frequency}
            onValueChange={(value: 'weekly' | 'monthly') => onChange({ ...form, frequency: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>{submitLabel}</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>{cancelLabel}</Button>
      </div>
    </form>
  )
}
