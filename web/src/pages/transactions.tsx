import { useState, useContext, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ArrowLeftRight } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppModal } from '@/components/AppModal'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionFilters } from '@/components/TransactionFilters'
import {
  fetchAccounts,
  fetchTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  confirmTransaction,
  type TransactionResponse,
} from '@/lib/api'
import { formatDate } from '@/lib/format'
import { AccountContext } from '@/App'

const CATEGORIES = [
  'General', 'Food', 'Rent', 'Utilities', 'Transportation', 'Entertainment',
  'Healthcare', 'Shopping', 'Subscriptions', 'Insurance', 'Savings', 'Income',
]

interface FormData {
  account_id: string
  amount: number
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
    description: '',
    category: 'General',
    is_recurring: false,
    frequency: 'monthly',
    anchor_date: '',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [amountText, setAmountText] = useState('')
  const [sortField, setSortField] = useState<'description' | 'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterType, setFilterType] = useState<'all' | 'recurring' | 'one-time'>('all')
  const [showFilters, setShowFilters] = useState(false)

  const {
    data: accounts = [],
    isLoading: accountsLoading,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const currentAccountId = selectedAccountId || accounts[0]?.id
  const currentAccountCurrency = accounts.find(a => a.id === currentAccountId)?.currency ?? 'BRL'

  const {
    data: transactions = [],
    isLoading: txnsLoading,
    isError,
  } = useQuery({
    queryKey: ['transactions', currentAccountId],
    queryFn: () => fetchTransactions(currentAccountId),
    enabled: !!currentAccountId,
  })

  const filteredAndSortedTxns = useMemo(() => {
    let txns = [...transactions]
    
    if (filterCategory !== 'all') {
      txns = txns.filter((t: TransactionResponse) => t.category === filterCategory)
    }
    
    if (filterType === 'recurring') {
      txns = txns.filter((t: TransactionResponse) => t.is_recurring)
    } else if (filterType === 'one-time') {
      txns = txns.filter((t: TransactionResponse) => !t.is_recurring)
    }
    
    txns.sort((a: TransactionResponse, b: TransactionResponse) => {
      let cmp = 0
      if (sortField === 'description') {
        cmp = a.description.localeCompare(b.description)
      } else if (sortField === 'date') {
        const dateA = a.next_occurrence || a.timestamp || a.anchor_date || ''
        const dateB = b.next_occurrence || b.timestamp || b.anchor_date || ''
        cmp = dateA.localeCompare(dateB)
      } else if (sortField === 'amount') {
        cmp = a.amount - b.amount
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    
    return txns
  }, [transactions, filterCategory, filterType, sortField, sortDir])

  const categories = useMemo(() => {
    const cats = new Set(transactions.map((t: TransactionResponse) => t.category))
    return Array.from(cats).sort()
  }, [transactions])

  const hasActiveFilters = filterCategory !== 'all' || filterType !== 'all'

  const createMutation = useMutation({
    mutationFn: (data: FormData) => createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
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
      setFormErrors({})
      setAmountText('')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create transaction')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<FormData> }) =>
      updateTransaction(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
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
      setFormErrors({})
      setAmountText('')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update transaction')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
      toast.success('Transaction deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete transaction')
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
      toast.success('Payment confirmed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to confirm payment')
    },
  })

  const handleConfirmClick = (id: string) => {
    confirmMutation.mutate(id)
  }

  const handleCreateClick = () => {
    setIsCreating(true)
    setEditingId(null)
    setFormErrors({})
    setAmountText('')
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
    setFormErrors({})
    setAmountText(txn.amount.toString())
    setFormData({
      account_id: txn.account_id,
      amount: txn.amount,
      description: txn.description,
      category: txn.category,
      is_recurring: txn.is_recurring,
      frequency: txn.frequency || 'monthly',
      anchor_date: txn.anchor_date ? txn.anchor_date.slice(0, 10) : '',
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
    const anchorDate = formData.anchor_date ? formData.anchor_date + 'T00:00:00Z' : undefined
    const payload = { ...formData, anchor_date: anchorDate }
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
    setAmountText('')
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

  const isPending = createMutation.isPending || updateMutation.isPending
  const txnToDelete = transactions.find((t: TransactionResponse) => t.id === confirmDelete)

  const handleTransactionChange = (changes: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...changes }))
  }

  const handleTransactionAmountParsed = (parsed: number | null) => {
    setFormData(prev => ({ ...prev, amount: parsed ?? 0 }))
  }

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
        <Button onClick={handleCreateClick} size="sm" className="hidden sm:inline-flex">
          <Plus size={16} />
          Add Transaction
        </Button>
      </div>

      <TransactionFilters
        showFilters={showFilters}
        hasActiveFilters={hasActiveFilters}
        filterCategory={filterCategory}
        filterType={filterType}
        categories={categories}
        sortField={sortField}
        sortDir={sortDir}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onFilterCategoryChange={setFilterCategory}
        onFilterTypeChange={setFilterType}
        onSortFieldChange={setSortField}
        onSortDirChange={setSortDir}
        onResetFilters={() => {
          setFilterCategory('all')
          setFilterType('all')
        }}
      />

      <Skeleton
        name="transaction-list"
        loading={txnsLoading}
        fallback={
          <div className="flex flex-col gap-2" role="status" aria-label="Loading transactions">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
            ))}
            <span className="sr-only">Loading...</span>
          </div>
        }
      >
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
          <SharedDebtList
            mode="auto"
            view="owner"
            items={filteredAndSortedTxns.map((txn: TransactionResponse) => ({
              id: txn.id,
              title: txn.description,
              subtitle: `${txn.category} · ${txn.is_recurring ? `${txn.frequency} · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : (txn.anchor_date ? formatDate(txn.anchor_date) : '-')}` : formatDate(txn.timestamp)}`,
              amount: txn.amount,
              currency: currentAccountCurrency,
              status: {
                label: txn.is_recurring ? 'Recurring' : 'One-time',
                tone: txn.is_recurring ? 'default' : 'secondary',
              },
              canConfirm: txn.is_recurring,
              canDelete: true,
              canOpen: true,
            }))}
            emptyTitle="No transactions match your filters"
            emptyHint="Adjust filters and try again"
            onConfirm={handleConfirmClick}
            onDelete={setConfirmDelete}
            onOpen={(id) => {
              const txn = transactions.find((t: TransactionResponse) => t.id === id)
              if (txn) handleEditClick(txn)
            }}
          />
        )}
      </Skeleton>

      <AppModal
        open={isCreating || !!editingId}
        onOpenChange={(open) => !open && handleCancel()}
        title={editingId ? 'Edit Transaction' : 'New Transaction'}
        description={editingId ? 'Update transaction details.' : 'Create a new transaction.'}
      >
        <TransactionForm
          editingId={editingId}
          formData={formData}
          formErrors={formErrors}
          amountText={amountText}
          isPending={isPending}
          categories={CATEGORIES}
          accounts={accounts}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onChange={handleTransactionChange}
          onAmountTextChange={setAmountText}
          onAmountParsedChange={handleTransactionAmountParsed}
          onClearError={field => setFormErrors({ ...formErrors, [field]: undefined })}
        />
      </AppModal>

      <div className="h-24 sm:h-8" />

      <div className="sm:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-30">
        <Button onClick={handleCreateClick} className="h-12 shadow-lg rounded-full px-5">
          <Plus size={18} />
          New Transaction
        </Button>
      </div>
    </div>
  )
}
