import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  fetchAccounts,
  fetchTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type TransactionResponse,
} from '@/lib/api'

interface FormData {
  account_id: string
  amount: number
  description: string
  category: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
}

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const [selectedAccountId] = useState<string>('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({
    account_id: '',
    amount: 0,
    description: '',
    category: 'General',
    is_recurring: false,
    frequency: 'monthly',
    anchor_date: '',
  })

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
    mutationFn: (data: FormData) => createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Transaction created')
      setIsCreating(false)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        description: '',
        category: 'General',
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create transaction')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<FormData> }) =>
      updateTransaction(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Transaction updated')
      setEditingId(null)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        description: '',
        category: 'General',
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
      })
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
    setFormData({
      account_id: currentAccountId,
      amount: 0,
      description: '',
      category: 'General',
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
    })
  }

  const handleEditClick = (txn: TransactionResponse) => {
    setEditingId(txn.id)
    setFormData({
      account_id: txn.account_id,
      amount: txn.amount,
      description: txn.description,
      category: txn.category,
      is_recurring: txn.is_recurring,
      frequency: txn.frequency || 'monthly',
      anchor_date: txn.anchor_date || '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.description.trim()) {
      toast.error('Description is required')
      return
    }

    if (formData.amount === 0) {
      toast.error('Amount must be non-zero')
      return
    }

    if (!formData.category.trim()) {
      toast.error('Category is required')
      return
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, updates: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    setFormData({
      account_id: currentAccountId,
      amount: 0,
      description: '',
      category: 'General',
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
    })
  }

  if (isError || accountsLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="border-b border-border/50 sticky top-0 z-10 backdrop-blur-sm bg-background/80">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
            <a
              href="/"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </a>
            <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
              CIBI
            </span>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-center text-destructive">
            {isError ? 'Failed to load transactions.' : 'Loading accounts...'}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/50 sticky top-0 z-10 backdrop-blur-sm bg-background/80">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </a>
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
            CIBI
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
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

        {txnsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 rounded-xl bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8 text-muted-foreground">
                  No transactions yet. Create one to get started.
                </CardContent>
              </Card>
            ) : (
              transactions.map(txn => (
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
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          onClick={() => {
                            if (window.confirm(`Delete "${txn.description}"?`)) {
                              deleteMutation.mutate(txn.id)
                            }
                          }}
                          variant="ghost"
                          size="sm"
                          title="Delete"
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
        )}

        {(isCreating || editingId) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editingId ? 'Edit Transaction' : 'New Transaction'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!editingId && (
                  <div>
                    <label className="block text-xs font-medium mb-2">Account *</label>
                    <select
                      value={formData.account_id}
                      onChange={e => setFormData({ ...formData, account_id: e.target.value })}
                      className="w-full h-8 px-2.5 py-1 rounded-lg border border-input bg-transparent text-base md:text-sm"
                    >
                      <option value="">Select account</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-2">Amount *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount / 100}
                    onChange={e =>
                      setFormData({ ...formData, amount: Math.round(parseFloat(e.target.value) * 100) })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-2">Description *</label>
                  <Input
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Transaction description"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-2">Category *</label>
                  <Input
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    placeholder="General"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="recurring"
                    checked={formData.is_recurring}
                    onChange={e => setFormData({ ...formData, is_recurring: e.target.checked })}
                    className="rounded border border-input"
                  />
                  <label htmlFor="recurring" className="text-xs font-medium cursor-pointer">
                    Recurring
                  </label>
                </div>
                {formData.is_recurring && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-2">Frequency</label>
                      <select
                        value={formData.frequency || 'monthly'}
                        onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                        className="w-full h-8 px-2.5 py-1 rounded-lg border border-input bg-transparent text-base md:text-sm"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Biweekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2">Anchor Date</label>
                      <Input
                        type="date"
                        value={formData.anchor_date || ''}
                        onChange={e => setFormData({ ...formData, anchor_date: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div className="flex gap-2 pt-4">
                  <Button type="submit" size="sm">
                    {editingId ? 'Update' : 'Create'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="h-8" />
      </main>
    </div>
  )
}
