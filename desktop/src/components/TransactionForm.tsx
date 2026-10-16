import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ValueInput } from '@/components/ui/value-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoryField } from '@/components/CategoryField'
import { LinksField } from '@/components/LinksField'
import type { TransactionLink } from '@/lib/api'

export interface TransactionFormValues {
  account_id: string
  amount: number
  title: string
  description?: string
  links?: TransactionLink[]
  category?: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
  requires_confirmation?: boolean
  is_installment?: boolean
  total_installments?: number
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
          <Label htmlFor="txn-amount" className="text-xs">
            {formData.is_installment ? 'Per installment amount *' : 'Amount *'}
          </Label>
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
          <Label htmlFor="txn-title" className="text-xs">Title *</Label>
          <Input
            id="txn-title"
            value={formData.title}
            onChange={e => {
              onChange({ title: e.target.value })
              if (formErrors.title) onClearError('title')
            }}
            placeholder="Transaction title"
            aria-invalid={!!formErrors.title || undefined}
            aria-describedby={formErrors.title ? 'txn-title-error' : undefined}
          />
          {formErrors.title && (
            <p id="txn-title-error" className="text-xs text-destructive">
              {formErrors.title}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="txn-description" className="text-xs">Description</Label>
        <Textarea
          id="txn-description"
          rows={3}
          value={formData.description ?? ''}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Details that help you, and help suggest a category (optional)"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="txn-links" className="text-xs">Links</Label>
        <LinksField id="txn-links" value={formData.links ?? []} onChange={links => onChange({ links })} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="txn-category" className="text-xs">Category</Label>
        <CategoryField
          id="txn-category"
          value={formData.category ?? ''}
          title={formData.title}
          description={formData.description ?? ''}
          onChange={category => onChange({ category })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-xs">Type</Label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'none', label: 'One-time' },
            { value: 'recurring', label: 'Recurring' },
            { value: 'pending', label: 'Pending payment' },
            { value: 'installment', label: 'Installment plan' },
          ] as const).map(({ value, label }) => {
            const active =
              (value === 'recurring' && !!formData.is_recurring) ||
              (value === 'pending' && !formData.is_recurring && !formData.is_installment && !!formData.requires_confirmation) ||
              (value === 'installment' && !!formData.is_installment) ||
              (value === 'none' && !formData.is_recurring && !formData.requires_confirmation && !formData.is_installment)
            return (
              <button
                type="button"
                key={value}
                className={`rounded-md border px-3 py-2.5 text-xs text-left transition-colors ${active ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'}`}
                onClick={() => onChange({
                  is_recurring: value === 'recurring',
                  is_installment: value === 'installment',
                  requires_confirmation: value === 'pending',
                })}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
      {formData.is_installment && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-total-installments" className="text-xs">Total installments</Label>
            <Input
              id="txn-total-installments"
              type="number"
              min={1}
              value={formData.total_installments ?? ''}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                onChange({ total_installments: isNaN(v) ? undefined : v })
              }}
              placeholder="12"
            />
          </div>
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
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-anchor" className="text-xs">First payment date</Label>
            <DateInput
              id="txn-anchor"
              value={formData.anchor_date || ''}
              onChange={anchor_date => onChange({ anchor_date })}
            />
          </div>
        </>
      )}
      {!formData.is_installment && (formData.is_recurring || formData.requires_confirmation) && (
        <>
          {formData.is_recurring && (
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
                  <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="txn-anchor" className="text-xs">{formData.is_recurring ? 'Anchor Date' : 'Pending date'}</Label>
            <DateInput
              id="txn-anchor"
              value={formData.anchor_date || ''}
              onChange={anchor_date => onChange({ anchor_date })}
            />
          </div>
        </>
      )}
      <div className="sticky bottom-0 bg-popover/95 backdrop-blur-sm flex gap-2 pt-4 pb-1">
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
