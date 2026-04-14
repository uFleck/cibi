import { useState, useContext } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, ArrowLeftRight } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  fetchAccounts,
  fetchTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type TransactionResponse,
} from '@/lib/api'
import { AccountContext } from '@/App'

const CATEGORIES = [
  'General', 'Food', 'Rent', 'Utilities', 'Transportation', 'Entertainment',
  'Healthcare', 'Shopping', 'Subscriptions', 'Insurance', 'Savings', 'Income',
]

interface FormData {
  account_id: string
  amount: number
  amountSign: 'positive' | 'negative'
  description: string
  category: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
}

type FormErrors = Partial<Record<keyof FormData, string>>

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId } = useContext(AccountContext)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    account_id: '',
    amount: 0,
    amountSign: 'negative',
    description: '',
    category: 'General',
    is_recurring: false,
    frequency: 'monthly',
    anchor_date: '',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const {
    data: accounts = [],
    isLoading: accountsLoading,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const currentAccountId = selectedAccountId || accounts[0]?.id

  const {
    data: transactions = [],
    isLoading: txnsLoading,
    isError,
  } = useQuery({
    queryKey: ['transactions', currentAccountId],
    queryFn: () => fetchTransactions(currentAccountId),
    enabled: !!currentAccountId,
  })

  const createMutation = useMutation({
    mutationFn: ({ amountSign: _sign, ...data }: FormData) => createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Transaction created')
      setIsCreating(false)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        amountSign: 'negative',
        description: '',
        category: 'General',
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
      })
      setFormErrors({})
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create transaction')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates: { amountSign: _sign, ...updates } }: { id: string; updates: Partial<FormData> }) =>
      updateTransaction(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Transaction updated')
      setEditingId(null)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        amountSign: 'negative',
        description: '',
        category: 'General',
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
      })
      setFormErrors({})
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update transaction')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Transaction deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete transaction')
    },
  })

  const handleCreateClick = () => {
    setIsCreating(true)
    setEditingId(null)
    setFormErrors({})
    setFormData({
      account_id: currentAccountId,
      amount: 0,
      amountSign: 'negative',
      description: '',
      category: 'General',
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
    })
  }

  const handleEditClick = (txn: TransactionResponse) => {
    setEditingId(txn.id)
    setFormErrors({})
    setFormData({
      account_id: txn.account_id,
      amount: Math.abs(txn.amount),
      amountSign: txn.amount < 0 ? 'negative' : 'positive',
      description: txn.description,
      category: txn.category,
      is_recurring: txn.is_recurring,
      frequency: txn.frequency || 'monthly',
      anchor_date: txn.anchor_date || '',
    })
  }

  const validate = (): boolean => {
    const errors: FormErrors = {}
    if (!formData.description.trim()) errors.description = 'Description is required'
    if (formData.amount === 0) errors.amount = 'Amount must be non-zero'
    if (!formData.category.trim()) errors.category = 'Category is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const signedAmount = formData.amountSign === 'negative' ? -Math.abs(formData.amount) : Math.abs(formData.amount)
    const anchorDate = formData.anchor_date ? formData.anchor_date + 'T00:00:00Z' : undefined
    const payload = { ...formData, amount: signedAmount, anchor_date: anchorDate }
    if (editingId) {
      updateMutation.mutate({ id: editingId, updates: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    setFormErrors({})
    setFormData({
      account_id: currentAccountId,
      amount: 0,
      description: '',
      category: 'General',
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
      amountSign: 'negative',
    })
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const txnToDelete = transactions.find((t: TransactionResponse) => t.id === confirmDelete)

  if (isError || accountsLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center text-destructive">
          {isError ? 'Failed to load transactions.' : 'Loading accounts...'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
        title={`Delete "${txnToDelete?.description}"?`}
        description="This action cannot be undone."
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">Transactions</h1>
          {currentAccountId && (
            <p className="text-xs text-muted-foreground">
              Account: {accounts.find(a => a.id === currentAccountId)?.name}
            </p>
          )}
        </div>
        <Button onClick={handleCreateClick} size="sm">
          <Plus size={16} />
          New Transaction
        </Button>
      </div>

      <Skeleton
        name="transaction-list"
        loading={txnsLoading}
        fallback={
          <div className="space-y-3" role="status" aria-label="Loading transactions">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 rounded-xl bg-card/60 animate-pulse border border-border/40" />
            ))}
            <span className="sr-only">Loading...</span>
          </div>
        }
      >
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <ArrowLeftRight className="mx-auto mb-4 text-muted-foreground/40" size={40} />
                <p className="text-muted-foreground mb-4">No transactions yet</p>
                <Button onClick={handleCreateClick} size="sm">
                  <Plus size={16} />
                  Create First Transaction
                </Button>
              </CardContent>
            </Card>
          ) : (
            transactions.map((txn: TransactionResponse) => (
              <Card key={txn.id}>
                <CardContent className="py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{txn.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {txn.category}
                        {txn.is_recurring && ' • Recurring'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${txn.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {txn.amount >= 0 ? '+' : ''}{(txn.amount / 100).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(txn.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        onClick={() => handleEditClick(txn)}
                        variant="ghost"
                        size="sm"
                        aria-label="Edit transaction"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        onClick={() => setConfirmDelete(txn.id)}
                        variant="ghost"
                        size="sm"
                        aria-label="Delete transaction"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </Skeleton>

      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? 'Edit Transaction' : 'New Transaction'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {!editingId && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="txn-account" className="text-xs">Account *</Label>
                  <Select
                    value={formData.account_id}
                    onValueChange={v => setFormData({ ...formData, account_id: v })}
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="txn-amount" className="text-xs">Amount *</Label>
                <div className="flex gap-2">
                  <div className="flex rounded-md border border-input overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, amountSign: 'positive' })}
                      className={`px-3 text-sm font-medium transition-colors ${formData.amountSign === 'positive' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, amountSign: 'negative' })}
                      className={`px-3 text-sm font-medium transition-colors ${formData.amountSign === 'negative' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      −
                    </button>
                  </div>
                  <Input
                    id="txn-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount / 100}
                    onChange={e => {
                      setFormData({ ...formData, amount: Math.round(parseFloat(e.target.value) * 100) })
                      if (formErrors.amount) setFormErrors({ ...formErrors, amount: undefined })
                    }}
                    placeholder="0.00"
                    aria-invalid={!!formErrors.amount || undefined}
                    aria-describedby={formErrors.amount ? 'txn-amount-error' : undefined}
                  />
                </div>
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
                    setFormData({ ...formData, description: e.target.value })
                    if (formErrors.description) setFormErrors({ ...formErrors, description: undefined })
                  }}
                  placeholder="Transaction description"
                  autoFocus
                  aria-invalid={!!formErrors.description || undefined}
                  aria-describedby={formErrors.description ? 'txn-description-error' : undefined}
                />
                {formErrors.description && (
                  <p id="txn-description-error" className="text-xs text-destructive">
                    {formErrors.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="txn-category" className="text-xs">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={v => {
                    setFormData({ ...formData, category: v })
                    if (formErrors.category) setFormErrors({ ...formErrors, category: undefined })
                  }}
                >
                  <SelectTrigger id="txn-category" size="sm" className="w-full" aria-invalid={!!formErrors.category || undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
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
                  onCheckedChange={v => setFormData({ ...formData, is_recurring: v })}
                />
                <Label htmlFor="txn-recurring" className="text-xs cursor-pointer">Recurring</Label>
              </div>
              {formData.is_recurring && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="txn-frequency" className="text-xs">Frequency</Label>
                    <Select
                      value={formData.frequency || 'monthly'}
                      onValueChange={v => setFormData({ ...formData, frequency: v })}
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
                      onChange={e => setFormData({ ...formData, anchor_date: e.target.value })}
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-4">
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
                  onClick={handleCancel}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="h-8" />
    </div>
  )
}
