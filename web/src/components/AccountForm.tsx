import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ValueInput } from '@/components/ui/value-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface AccountFormValues {
  name: string
  current_balance: number
  currency: string
}

export type AccountFormErrors = Partial<Record<keyof AccountFormValues, string>>

export interface AccountFormProps {
  formData: AccountFormValues
  formErrors: AccountFormErrors
  balanceText: string
  isPending: boolean
  editingId: string | null
  currencies: string[]
  onNameChange: (value: string) => void
  onBalanceTextChange: (value: string) => void
  onBalanceParsedChange: (value: number | null) => void
  onCurrencyChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

export function AccountForm({
  formData,
  formErrors,
  balanceText,
  isPending,
  editingId,
  currencies,
  onNameChange,
  onBalanceTextChange,
  onBalanceParsedChange,
  onCurrencyChange,
  onSubmit,
  onCancel,
}: AccountFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="account-name" className="text-xs">Name *</Label>
        <Input
          id="account-name"
          value={formData.name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Account name"
          autoFocus
          aria-invalid={!!formErrors.name || undefined}
          aria-describedby={formErrors.name ? 'account-name-error' : undefined}
        />
        {formErrors.name && (
          <p id="account-name-error" className="text-xs text-destructive">
            {formErrors.name}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-balance" className="text-xs">Current Balance</Label>
          <ValueInput
            id="account-balance"
            value={balanceText}
            onValueChange={onBalanceTextChange}
            onParsedValueChange={onBalanceParsedChange}
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-currency" className="text-xs">Currency *</Label>
          <Select
            value={formData.currency}
            onValueChange={onCurrencyChange}
          >
            <SelectTrigger id="account-currency" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
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
