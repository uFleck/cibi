import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ValueInput } from '@/components/ui/value-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type AccountScheduleFrequency = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'

export interface AccountScheduleValues {
  label: string
  frequency: AccountScheduleFrequency
  anchor_date: string
  amount: string
  day_of_month_2: string
}

export interface AccountScheduleFormProps {
  editingScheduleId: string | null
  scheduleForm: AccountScheduleValues
  scheduleFormErrors: Partial<Record<string, string>>
  isPending: boolean
  onSubmit: (e: FormEvent) => void
  onChange: (changes: Partial<AccountScheduleValues>) => void
  onClearError: (field: string) => void
  onCancelEdit: () => void
}

export function AccountScheduleForm({
  editingScheduleId,
  scheduleForm,
  scheduleFormErrors,
  isPending,
  onSubmit,
  onChange,
  onClearError,
  onCancelEdit,
}: AccountScheduleFormProps) {
  return (
    <form onSubmit={onSubmit} className="border-t pt-4 mt-4">
      <h4 className="font-medium mb-4">
        {editingScheduleId ? 'Edit Schedule' : 'Add Schedule'}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="schedule-label" className="text-xs">Label</Label>
          <Input
            id="schedule-label"
            placeholder="e.g. Main paycheck"
            value={scheduleForm.label}
            onChange={e => onChange({ label: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="schedule-frequency" className="text-xs">Frequency</Label>
          <Select
            value={scheduleForm.frequency}
            onValueChange={v => onChange({ frequency: v as AccountScheduleFrequency })}
          >
            <SelectTrigger id="schedule-frequency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
              <SelectItem value="semi-monthly">Semi-monthly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="schedule-anchor" className="text-xs">Anchor Date *</Label>
          <Input
            id="schedule-anchor"
            type="date"
            value={scheduleForm.anchor_date}
            onChange={e => {
              onChange({ anchor_date: e.target.value })
              if (scheduleFormErrors.anchor_date) onClearError('anchor_date')
            }}
          />
          {scheduleFormErrors.anchor_date && (
            <p className="text-xs text-destructive">{scheduleFormErrors.anchor_date}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="schedule-amount" className="text-xs">Amount ($) *</Label>
          <ValueInput
            id="schedule-amount"
            value={scheduleForm.amount}
            onValueChange={value => {
              onChange({ amount: value })
              if (scheduleFormErrors.amount) onClearError('amount')
            }}
            placeholder="0.00"
            allowNegative={false}
          />
          {scheduleFormErrors.amount && (
            <p className="text-xs text-destructive">{scheduleFormErrors.amount}</p>
          )}
        </div>
        {scheduleForm.frequency === 'semi-monthly' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="schedule-day2" className="text-xs">Day of Month 2</Label>
            <Input
              id="schedule-day2"
              type="number"
              min="1"
              max="31"
              value={scheduleForm.day_of_month_2}
              onChange={e => onChange({ day_of_month_2: e.target.value })}
            />
          </div>
        )}
      </div>
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm flex gap-2 mt-4 pt-2 pb-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {editingScheduleId ? 'Update Schedule' : 'Add Schedule'}
        </Button>
        {editingScheduleId && (
          <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
