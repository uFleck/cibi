export interface FormData {
  account_id: string
  amount: number
  description: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
  requires_confirmation?: boolean
  is_installment?: boolean
  total_installments?: number
}

export type FormErrors = Partial<Record<keyof FormData, string>>

export function emptyFormData(accountId: string): FormData {
  return {
    account_id: accountId,
    amount: 0,
    description: '',
    is_recurring: false,
    frequency: 'monthly',
    anchor_date: '',
    requires_confirmation: false,
    is_installment: false,
    total_installments: undefined,
  }
}
