import { useState, useContext, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ArrowLeftRight, X, Users } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditSheet } from '@/components/EditSheet'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionFilters, type TransactionPreset } from '@/components/TransactionFilters'
import { LedgerRecentWidget } from '@/components/LedgerRecentWidget'
import {
  fetchAccounts,
  fetchTransactions,
  listPaySchedules,
  fetchFriendBreakdown,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  confirmTransaction,
  confirmInstallmentTransaction,
  listFriends,
  confirmDebt,
  deletePeerDebt,
  type TransactionResponse,
  type FriendResponse,
} from '@/lib/api'
import { formatDate } from '@/lib/format'
import { fromDateInputValue, toDateInputValue } from '@/lib/locale'
import {
  buildImpactSummary,
  computeProjectedBalanceAfterNextWindow,
  getWindowBounds,
  getWindowLabels,
  isCurrentDue,
  matchesPresetFilter,
} from '@/lib/transactions-impact'
import { AccountContext } from '@/App'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

interface FormData {
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

type FormErrors = Partial<Record<keyof FormData, string>>

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId } = useContext(AccountContext)
  const [activeTab, setActiveTab] = useState<'transactions' | 'friend-debts'>('transactions')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [peerDebtFilter, setPeerDebtFilter] = useState<{ friendId: string; direction: 'all' | 'i-owe' | 'they-owe'; status: 'all' | 'confirmed' | 'pending' }>({ friendId: 'all', direction: 'all', status: 'all' })
  const [formData, setFormData] = useState<FormData>({
    account_id: '',
    amount: 0,
    description: '',
    is_recurring: false,
    frequency: 'monthly',
    anchor_date: '',
    requires_confirmation: false,
    is_installment: false,
    total_installments: undefined,
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [amountText, setAmountText] = useState('')
  const [sortField, setSortField] = useState<'description' | 'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [preset, setPreset] = useState<TransactionPreset | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')

  const {
    data: accounts = [],
    isLoading: accountsLoading,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const currentAccountId = selectedAccountId || accounts[0]?.id
  const currentAccount = accounts.find(a => a.id === currentAccountId)
  const currentAccountCurrency = currentAccount?.currency ?? 'BRL'

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

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: listFriends,
  })

  const nextPayday = paySchedules.length > 0
    ? paySchedules.reduce((earliest, ps) => (ps.next_payday < earliest ? ps.next_payday : earliest), paySchedules[0].next_payday)
    : null

  const windowLabels = useMemo(() => {
    return getWindowLabels(nextPayday, paySchedules)
  }, [nextPayday, paySchedules])

  const filteredAndSortedTxns = useMemo(() => {
    const now = new Date()

    let txns = transactions.filter((t: TransactionResponse) => t.type === 'personal')

    txns = txns.filter((t: TransactionResponse) => matchesPresetFilter({
      txn: t,
      preset,
      now,
      nextPayday,
      paySchedules,
    }))

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      txns = txns.filter(t => t.description.toLowerCase().includes(q))
    }

    const minVal = parseFloat(amountMin)
    const maxVal = parseFloat(amountMax)
    if (!isNaN(minVal)) {
      txns = txns.filter(t => Math.abs(t.amount) >= minVal)
    }
    if (!isNaN(maxVal)) {
      txns = txns.filter(t => Math.abs(t.amount) <= maxVal)
    }

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
  }, [transactions, preset, sortField, sortDir, nextPayday, paySchedules, searchQuery, amountMin, amountMax])

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

  const hasActiveFilters = preset !== null || !!searchQuery.trim() || !!(amountMin || amountMax)

  const filteredPeerDebts = useMemo(() => {
    let debts = transactions.filter((t: TransactionResponse) => t.type === 'peer')
    if (peerDebtFilter.friendId !== 'all') {
      debts = debts.filter(t => t.friend_id === peerDebtFilter.friendId)
    }
    if (peerDebtFilter.direction === 'i-owe') {
      debts = debts.filter(t => t.amount < 0)
    } else if (peerDebtFilter.direction === 'they-owe') {
      debts = debts.filter(t => t.amount > 0)
    }
    if (peerDebtFilter.status === 'confirmed') {
      debts = debts.filter(t => t.confirmed_at !== null)
    } else if (peerDebtFilter.status === 'pending') {
      debts = debts.filter(t => t.confirmed_at === null)
    }
    return debts
  }, [transactions, peerDebtFilter])

  const createMutation = useMutation({
    mutationFn: (data: FormData) => createTransaction(data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Transaction created')
      setIsCreating(false)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        description: '',
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
        requires_confirmation: false,
        is_installment: false,
        total_installments: undefined,
      })
      setFormErrors({})
      setAmountText('')
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to create transaction')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<FormData> }) =>
      updateTransaction(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.map(t => t.id === id ? { ...t, ...updates } : t) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Transaction updated')
      setEditingId(null)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        description: '',
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
        requires_confirmation: false,
        is_installment: false,
        total_installments: undefined,
      })
      setFormErrors({})
      setAmountText('')
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to update transaction')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      const deletedTxn = prevTxns?.find(t => t.id === id) ?? null
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.filter(t => t.id !== id) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount, deletedTxn }
    },
    onSuccess: (_, _id, ctx) => {
      const deletedTxn = ctx?.deletedTxn
      const deletedName = deletedTxn?.description ?? 'Transaction'
      toast(`${deletedName} deleted`, {
        action: {
          label: 'Undo',
          onClick: () => {
            if (deletedTxn) {
              createMutation.mutate({
                account_id: deletedTxn.account_id,
                amount: deletedTxn.amount,
                description: deletedTxn.description,
                is_recurring: deletedTxn.is_recurring,
                frequency: deletedTxn.frequency ?? undefined,
                anchor_date: deletedTxn.anchor_date ?? undefined,
                requires_confirmation: deletedTxn.requires_confirmation,
                is_installment: deletedTxn.is_installment,
                total_installments: deletedTxn.total_installments ?? undefined,
              })
            }
          },
        },
        duration: 5000,
      })
    },
    onError: (error, _id, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to delete transaction')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmTransaction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.map(t => t.id === id ? { ...t, confirmed_at: new Date().toISOString() } : t) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Payment confirmed')
    },
    onError: (error, _id, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to confirm payment')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const confirmInstallmentMutation = useMutation({
    mutationFn: (id: string) => confirmInstallmentTransaction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', currentAccountId] })
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      await queryClient.cancelQueries({ queryKey: ['account', currentAccountId] })
      const prevTxns = queryClient.getQueryData<TransactionResponse[]>(['transactions', currentAccountId])
      const prevAccounts = queryClient.getQueryData(['accounts'])
      const prevAccount = queryClient.getQueryData(['account', currentAccountId])
      queryClient.setQueryData<TransactionResponse[]>(['transactions', currentAccountId], old =>
        old?.map(t => t.id === id ? { ...t, paid_installments: (t.paid_installments ?? 0) + 1 } : t) ?? []
      )
      return { prevTxns, prevAccounts, prevAccount }
    },
    onSuccess: () => {
      toast.success('Installment confirmed')
    },
    onError: (error, _id, ctx) => {
      if (ctx?.prevTxns) queryClient.setQueryData(['transactions', currentAccountId], ctx.prevTxns)
      if (ctx?.prevAccounts) queryClient.setQueryData(['accounts'], ctx.prevAccounts)
      if (ctx?.prevAccount) queryClient.setQueryData(['account', currentAccountId], ctx.prevAccount)
      toast.error((error as Error).message || 'Failed to confirm installment')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
    },
  })

  const handleConfirmClick = (id: string) => {
    const txn = transactions.find((t: TransactionResponse) => t.id === id)
    if (txn?.is_installment) {
      confirmInstallmentMutation.mutate(id)
    } else {
      confirmMutation.mutate(id)
    }
  }

  const handleClearFilters = useCallback(() => {
    setPreset(null)
    setSearchQuery('')
    setAmountMin('')
    setAmountMax('')
  }, [])

  const confirmPeerDebtMutation = useMutation({
    mutationFn: (id: string) => confirmDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Debt confirmed')
    },
    onError: () => toast.error('Failed to confirm debt'),
  })

  const deletePeerDebtMutation = useMutation({
    mutationFn: (id: string) => deletePeerDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Debt deleted')
    },
    onError: () => toast.error('Failed to delete debt'),
  })

  const handleBatchConfirmDueNow = useCallback(() => {
    const { nextPaydayDay } = getWindowBounds(paySchedules, nextPayday)
    const now = new Date()
    const dueNowIds = transactions
      .filter(t => !t.is_recurring && t.requires_confirmation && !t.confirmed_at &&
        isCurrentDue(t, now, nextPayday, nextPaydayDay))
      .map(t => t.id)
    dueNowIds.forEach(id => confirmMutation.mutate(id))
    toast.success(`Confirmed ${dueNowIds.length} payment${dueNowIds.length !== 1 ? 's' : ''}`)
  }, [transactions, nextPayday, paySchedules])

  const handleCreateClick = () => {
    setIsCreating(true)
    setEditingId(null)
    setFormErrors({})
    setAmountText('')
    setFormData({
      account_id: currentAccountId,
      amount: 0,
      description: '',
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
      requires_confirmation: false,
      is_installment: false,
      total_installments: undefined,
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
      is_recurring: txn.is_recurring,
      frequency: txn.frequency || 'monthly',
      anchor_date: toDateInputValue(txn.anchor_date),
      requires_confirmation: txn.requires_confirmation,
      is_installment: txn.is_installment,
      total_installments: txn.total_installments ?? undefined,
    })
  }

  const validate = (): boolean => {
    const errors: FormErrors = {}
    if (!formData.description.trim()) errors.description = 'Description is required'
    if (formData.amount === 0) errors.amount = 'Amount must be non-zero'
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
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
      requires_confirmation: false,
      is_installment: false,
      total_installments: undefined,
    })
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const txnToDelete = transactions.find((t: TransactionResponse) => t.id === confirmDelete)

  // Filter state persistence
  const FILTER_KEY = `cibi:filters:${currentAccountId}`
  useEffect(() => {
    if (!currentAccountId) return
    try {
      const saved = sessionStorage.getItem(FILTER_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.preset !== undefined) setPreset(state.preset as TransactionPreset | null)
        if (state.sortField) setSortField(state.sortField)
        if (state.sortDir) setSortDir(state.sortDir)
      }
    } catch { /* ignore */ }
  }, [currentAccountId])

  useEffect(() => {
    if (!currentAccountId) return
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      preset, sortField, sortDir,
    }))
  }, [preset, sortField, sortDir, currentAccountId])

  const handleTransactionChange = (changes: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...changes }))
  }

  const handleTransactionAmountParsed = (parsed: number | null) => {
    setFormData(prev => ({ ...prev, amount: parsed ?? 0 }))
  }

  useKeyboardShortcuts({
    'n': handleCreateClick,
    'f': () => document.querySelector<HTMLInputElement>('[data-filter-search]')?.focus(),
  })

  if (isError || accountsLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center text-destructive">
          {isError ? 'Failed to load transactions.' : 'Loading accounts...'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
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
        {activeTab === 'transactions' && (
          <Button onClick={handleCreateClick} size="sm" className="hidden sm:inline-flex">
            <Plus size={16} />
            Add Transaction
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'transactions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <ArrowLeftRight size={14} className="inline mr-1.5 -mt-0.5" />
          Transactions
        </button>
        <button
          onClick={() => setActiveTab('friend-debts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'friend-debts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Users size={14} className="inline mr-1.5 -mt-0.5" />
          Friend Debts
        </button>
      </div>

      {activeTab === 'transactions' && <><Card>
        <CardContent className="py-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Unconfirmed payment impact</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <p>Current: <MoneyValue amount={unconfirmedImpact.currentAmount} currency={currentAccountCurrency} tone="negative" showSign="never" /> <span className="text-xs text-muted-foreground">({unconfirmedImpact.currentCount})</span></p>
            <p>Next: <MoneyValue amount={unconfirmedImpact.nextAmount} currency={currentAccountCurrency} tone="negative" showSign="never" /> <span className="text-xs text-muted-foreground">({unconfirmedImpact.nextCount})</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            Balance if paid: <MoneyValue amount={unconfirmedImpact.currentProjectedBalance} currency={currentAccountCurrency} tone="auto" showSign="always" /> now · <MoneyValue amount={unconfirmedImpact.nextProjectedBalance} currency={currentAccountCurrency} tone="auto" showSign="always" /> after next.
          </p>

          {unconfirmedImpact.currentCount > 0 && (
            <Button size="sm" variant="outline" onClick={handleBatchConfirmDueNow}>
              Confirm all {unconfirmedImpact.currentCount}
            </Button>
          )}
        </CardContent>
      </Card>

      {currentAccount && <LedgerRecentWidget account={currentAccount} />}

      <TransactionFilters
        showFilters={showFilters}
        hasActiveFilters={hasActiveFilters}
        preset={preset}
        sortField={sortField}
        sortDir={sortDir}
        searchQuery={searchQuery}
        amountMin={amountMin}
        amountMax={amountMax}
        windowLabels={windowLabels}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onPresetChange={setPreset}
        onSortFieldChange={setSortField}
        onSortDirChange={setSortDir}
        onSearchQueryChange={setSearchQuery}
        onAmountMinChange={setAmountMin}
        onAmountMaxChange={setAmountMax}
        onResetFilters={handleClearFilters}
      />

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Filters:</span>
          {preset !== null && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setPreset(null)}>
              {preset === 'due-now' ? windowLabels?.dueNowLabel :
               preset === 'current-window' ? windowLabels?.currentWindowLabel :
               preset === 'next-window' ? windowLabels?.nextWindowLabel :
               preset === 'all-recurring' ? 'All recurring' :
               preset === 'one-time-only' ? 'One-time only' : preset}
              <X size={12} />
            </Badge>
          )}
          {searchQuery.trim() && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setSearchQuery('')}>
              &ldquo;{searchQuery}&rdquo;
              <X size={12} />
            </Badge>
          )}
          {(amountMin || amountMax) && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => { setAmountMin(''); setAmountMax('') }}>
              ${amountMin || '0'}–${amountMax || '∞'}
              <X size={12} />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs h-7">
            Clear all
          </Button>
        </div>
      )}

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
              subtitle: txn.is_installment
                ? `Installment · ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'} paid · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : '-'}`
                : txn.is_recurring
                  ? `${txn.frequency} · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : (txn.anchor_date ? formatDate(txn.anchor_date) : '-')}`
                  : txn.requires_confirmation
                    ? (txn.confirmed_at ? `confirmed ${formatDate(txn.confirmed_at)}` : `pending ${formatDate(txn.anchor_date || txn.timestamp)}`)
                    : formatDate(txn.timestamp),
              amount: txn.is_installment
                ? txn.amount * ((txn.total_installments ?? 0) - (txn.paid_installments ?? 0))
                : txn.amount,
              total: txn.is_installment
                ? txn.amount * (txn.total_installments ?? 0)
                : txn.amount,
              perInstallment: txn.is_installment ? txn.amount : null,
              currency: currentAccountCurrency,
              status: {
                label: txn.is_installment
                  ? `Installment ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'}`
                  : txn.is_recurring
                    ? 'Recurring'
                    : txn.requires_confirmation
                      ? (txn.confirmed_at ? 'Pending payment · confirmed' : 'Pending payment')
                      : 'One-time',
                tone: (txn.is_installment || txn.is_recurring || txn.requires_confirmation)
                  ? 'default'
                  : 'secondary',
              },
              type: 'transaction' as const,
              canConfirm: txn.is_installment
                ? (txn.paid_installments ?? 0) < (txn.total_installments ?? 0)
                : txn.is_recurring || (txn.requires_confirmation && !txn.confirmed_at),
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
      </Skeleton></>}

      {activeTab === 'friend-debts' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Friend</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={peerDebtFilter.friendId}
                onChange={e => setPeerDebtFilter(f => ({ ...f, friendId: e.target.value }))}
              >
                <option value="all">All friends</option>
                {friends.map((fr: FriendResponse) => (
                  <option key={fr.id} value={fr.id}>{fr.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Direction</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={peerDebtFilter.direction}
                onChange={e => setPeerDebtFilter(f => ({ ...f, direction: e.target.value as typeof f.direction }))}
              >
                <option value="all">All</option>
                <option value="i-owe">I owe</option>
                <option value="they-owe">They owe</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={peerDebtFilter.status}
                onChange={e => setPeerDebtFilter(f => ({ ...f, status: e.target.value as typeof f.status }))}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
          </div>
          <Skeleton
            name="peer-debt-list"
            loading={txnsLoading}
            fallback={
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
                ))}
              </div>
            }
          >
            <SharedDebtList
              view="owner"
              items={filteredPeerDebts.map((txn: TransactionResponse) => {
                const friendName = friends.find((f: FriendResponse) => f.id === txn.friend_id)?.name ?? 'Unknown'
                const isConfirmed = txn.confirmed_at !== null
                const direction = txn.amount < 0 ? 'I owe' : 'They owe'
                return {
                  id: txn.id,
                  title: txn.description,
                  subtitle: `${friendName} · ${direction} · ${isConfirmed ? `confirmed ${formatDate(txn.confirmed_at!)}` : `pending ${formatDate(txn.anchor_date || txn.timestamp)}`}`,
                  amount: txn.is_installment
                    ? txn.amount * ((txn.total_installments ?? 0) - (txn.paid_installments ?? 0))
                    : txn.amount,
                  currency: currentAccountCurrency,
                  status: {
                    label: isConfirmed ? 'Confirmed' : (txn.is_installment ? `${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'} paid` : 'Pending'),
                    tone: isConfirmed ? 'default' as const : 'outline' as const,
                  },
                  canConfirm: !isConfirmed,
                  canDelete: true,
                }
              })}
              emptyTitle="No friend debts"
              emptyHint="Adjust filters or add a debt via Friends page"
              onConfirm={(id) => confirmPeerDebtMutation.mutate(id)}
              onDelete={(id) => deletePeerDebtMutation.mutate(id)}
            />
          </Skeleton>
        </div>
      )}

      <EditSheet
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
          accounts={accounts}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onChange={handleTransactionChange}
          onAmountTextChange={setAmountText}
          onAmountParsedChange={handleTransactionAmountParsed}
          onClearError={field => setFormErrors({ ...formErrors, [field]: undefined })}
        />
      </EditSheet>

      <div className="h-24 sm:h-8" />

      {activeTab === 'transactions' && (
        <div className="sm:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-30">
          <Button onClick={handleCreateClick} className="h-12 shadow-lg rounded-full px-5">
            <Plus size={18} />
            New Transaction
          </Button>
        </div>
      )}
    </div>
  )
}
