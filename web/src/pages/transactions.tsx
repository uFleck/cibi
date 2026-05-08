import { useState, useContext, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ArrowLeftRight } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppModal } from '@/components/AppModal'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionFilters, type TransactionPreset } from '@/components/TransactionFilters'
import {
  fetchAccounts,
  fetchTransactions,
  listPaySchedules,
  fetchFriendBreakdown,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  confirmTransaction,
  type TransactionResponse,
} from '@/lib/api'
import { formatDate } from '@/lib/format'
import { fromDateInputValue, toDateInputValue } from '@/lib/locale'
import {
  buildImpactSummary,
  computeProjectedBalanceAfterNextWindow,
  matchesPresetFilter,
} from '@/lib/transactions-impact'
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
  requires_confirmation?: boolean
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
    requires_confirmation: false,
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [amountText, setAmountText] = useState('')
  const [sortField, setSortField] = useState<'description' | 'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [preset, setPreset] = useState<TransactionPreset>('current-window')
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

  const { data: paySchedules = [] } = useQuery({
    queryKey: ['pay-schedules', currentAccountId],
    queryFn: () => listPaySchedules(currentAccountId!),
    enabled: !!currentAccountId,
  })

  const { data: friendBreakdown = [] } = useQuery({
    queryKey: ['friend-breakdown', currentAccountId],
    queryFn: () => fetchFriendBreakdown(currentAccountId!),
    enabled: !!currentAccountId,
  })

  const nextPayday = paySchedules.length > 0
    ? paySchedules.reduce((earliest, ps) => (ps.next_payday < earliest ? ps.next_payday : earliest), paySchedules[0].next_payday)
    : null

  const filteredAndSortedTxns = useMemo(() => {
    const now = new Date()

    let txns = [...transactions]

    if (filterCategory !== 'all') {
      txns = txns.filter((t: TransactionResponse) => t.category === filterCategory)
    }

    txns = txns.filter((t: TransactionResponse) => matchesPresetFilter({
      txn: t,
      preset,
      now,
      nextPayday,
      paySchedules,
    }))

    txns.sort((a: TransactionResponse, b: TransactionResponse) => {
      let cmp = 0
      if (sortField === 'description') {
        cmp = a.description.localeCompare(b.description)
      } else if (sortField === 'date') {
        const dateA = a.is_recurring
          ? (a.next_occurrence || a.anchor_date || a.timestamp || '')
          : (a.requires_confirmation ? (a.anchor_date || a.timestamp || '') : (a.timestamp || a.anchor_date || ''))
        const dateB = b.is_recurring
          ? (b.next_occurrence || b.anchor_date || b.timestamp || '')
          : (b.requires_confirmation ? (b.anchor_date || b.timestamp || '') : (b.timestamp || b.anchor_date || ''))
        cmp = dateA.localeCompare(dateB)
      } else if (sortField === 'amount') {
        cmp = a.amount - b.amount
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    
    return txns
  }, [transactions, filterCategory, preset, sortField, sortDir, nextPayday, paySchedules])

  const unconfirmedImpact = useMemo(() => {
    const currentBalance = accounts.find(a => a.id === currentAccountId)?.current_balance ?? 0
    const projectedBalanceAfterNextWindow = computeProjectedBalanceAfterNextWindow({
      currentBalance,
      transactions,
      paySchedules,
      friendBreakdown,
      nextPayday,
    })

    return buildImpactSummary({
      transactions,
      paySchedules,
      nextPayday,
      currentBalance,
      projectedBalanceAfterNextWindow,
    })
  }, [accounts, currentAccountId, friendBreakdown, nextPayday, paySchedules, transactions])

  const categories = useMemo(() => {
    const cats = new Set(transactions.map((t: TransactionResponse) => t.category))
    return Array.from(cats).sort()
  }, [transactions])

  const hasActiveFilters = filterCategory !== 'all' || preset !== 'current-window'

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
        requires_confirmation: false,
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
        requires_confirmation: false,
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
      requires_confirmation: false,
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
      anchor_date: toDateInputValue(txn.anchor_date),
      requires_confirmation: txn.requires_confirmation,
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
    const anchorDate = fromDateInputValue(formData.anchor_date)
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
      requires_confirmation: false,
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

      <Card>
        <CardContent className="py-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Unconfirmed payment impact</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <p>Current: <MoneyValue amount={unconfirmedImpact.currentAmount} currency={currentAccountCurrency} tone="negative" showSign="never" /> <span className="text-xs text-muted-foreground">({unconfirmedImpact.currentCount})</span></p>
            <p>Next: <MoneyValue amount={unconfirmedImpact.nextAmount} currency={currentAccountCurrency} tone="negative" showSign="never" /> <span className="text-xs text-muted-foreground">({unconfirmedImpact.nextCount})</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            Balance if paid: <MoneyValue amount={unconfirmedImpact.currentProjectedBalance} currency={currentAccountCurrency} tone="auto" showSign="always" /> now · <MoneyValue amount={unconfirmedImpact.nextProjectedBalance} currency={currentAccountCurrency} tone="auto" showSign="always" /> after next.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setPreset('due-now')}>Due now</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset('next-window')}>Next window</Button>
          </div>
        </CardContent>
      </Card>

      <TransactionFilters
        showFilters={showFilters}
        hasActiveFilters={hasActiveFilters}
        preset={preset}
        filterCategory={filterCategory}
        categories={categories}
        sortField={sortField}
        sortDir={sortDir}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onPresetChange={setPreset}
        onFilterCategoryChange={setFilterCategory}
        onSortFieldChange={setSortField}
        onSortDirChange={setSortDir}
        onResetFilters={() => {
          setFilterCategory('all')
          setPreset('current-window')
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
              subtitle: `${txn.category} · ${txn.is_recurring ? `${txn.frequency} · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : (txn.anchor_date ? formatDate(txn.anchor_date) : '-')}` : txn.requires_confirmation ? (txn.confirmed_at ? `confirmed ${formatDate(txn.confirmed_at)}` : `pending ${formatDate(txn.anchor_date || txn.timestamp)}`) : formatDate(txn.timestamp)}`,
              amount: txn.amount,
              currency: currentAccountCurrency,
              status: {
                label: txn.is_recurring ? 'Recurring' : txn.requires_confirmation ? (txn.confirmed_at ? 'Pending payment · confirmed' : 'Pending payment') : 'One-time',
                tone: txn.is_recurring ? 'default' : txn.requires_confirmation ? 'default' : 'secondary',
              },
              canConfirm: txn.is_recurring || (txn.requires_confirmation && !txn.confirmed_at),
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
