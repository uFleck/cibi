import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ValueInput } from '@/components/ui/value-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export interface TransactionFormValues {
  account_id: string
  amount: number
  description: string
  category: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
}

export type TransactionFormErrors = Partial<Record<keyof TransactionFormValues, string>>

export interface TransactionFormAccountOption {
  id: string
  name: string
}

export interface TransactionFormProps {
  editingId: string | null
  formData: TransactionFormValues
  formErrors: TransactionFormErrors
  amountText: string
  isPending: boolean
  categories: string[]
  accounts: TransactionFormAccountOption[]
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
  onChange: (changes: Partial<TransactionFormValues>) => void
  onAmountTextChange: (value: string) => void
  onAmountParsedChange: (value: number | null) => void
  onClearError: (field: keyof TransactionFormValues) => void
}

export function TransactionForm({
  editingId,
  formData,
  formErrors,
  amountText,
  isPending,
  categories,
  accounts,
  onSubmit,
  onCancel,
  onChange,
  onAmountTextChange,
  onAmountParsedChange,
  onClearError,
}: TransactionFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {!editingId && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-account" className="text-xs">Account *</Label>
          <Select
            value={formData.account_id}
            onValueChange={v => onChange({ account_id: v })}
          >
            <SelectTrigger id="txn-account" size="sm" className="w-full">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-amount" className="text-xs">Amount *</Label>
          <ValueInput
            id="txn-amount"
            value={amountText}
            onValueChange={raw => {
              onAmountTextChange(raw)
              if (formErrors.amount) onClearError('amount')
            }}
            onParsedValueChange={onAmountParsedChange}
            placeholder="-50.00"
            aria-invalid={!!formErrors.amount || undefined}
            aria-describedby={formErrors.amount ? 'txn-amount-error' : undefined}
            showSignToggle
          />
          {formErrors.amount && (
            <p id="txn-amount-error" className="text-xs text-destructive">
              {formErrors.amount}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-description" className="text-xs">Description *</Label>
          <Input
            id="txn-description"
            value={formData.description}
            onChange={e => {
              onChange({ description: e.target.value })
              if (formErrors.description) onClearError('description')
            }}
            placeholder="Transaction description"
            aria-invalid={!!formErrors.description || undefined}
            aria-describedby={formErrors.description ? 'txn-description-error' : undefined}
          />
          {formErrors.description && (
            <p id="txn-description-error" className="text-xs text-destructive">
              {formErrors.description}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="txn-category" className="text-xs">Category *</Label>
          <Select
            value={formData.category}
            onValueChange={v => {
              onChange({ category: v })
              if (formErrors.category) onClearError('category')
            }}
          >
            <SelectTrigger id="txn-category" size="sm" className="w-full" aria-invalid={!!formErrors.category || undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formErrors.category && (
            <p id="txn-category-error" className="text-xs text-destructive">
              {formErrors.category}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="txn-recurring"
            checked={!!formData.is_recurring}
            onCheckedChange={v => onChange({ is_recurring: v })}
          />
          <Label htmlFor="txn-recurring" className="text-xs cursor-pointer">Recurring</Label>
        </div>
      </div>
      {formData.is_recurring && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-frequency" className="text-xs">Frequency</Label>
            <Select
              value={formData.frequency || 'monthly'}
              onValueChange={v => onChange({ frequency: v })}
            >
              <SelectTrigger id="txn-frequency" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Biweekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-anchor" className="text-xs">Anchor Date</Label>
            <Input
              id="txn-anchor"
              type="date"
              value={formData.anchor_date || ''}
              onChange={e => onChange({ anchor_date: e.target.value })}
            />
          </div>
        </>
      )}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm flex gap-2 pt-4 pb-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending
            ? editingId
              ? 'Updating...'
              : 'Creating...'
            : editingId
              ? 'Update'
              : 'Create'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
