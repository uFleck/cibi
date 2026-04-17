import { useState, useContext, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, ArrowLeftRight, Check, ArrowUp, ArrowDown } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppModal } from '@/components/AppModal'
import { MobileActionButton } from '@/components/MobileActionButton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
import { MoneyValue } from '@/components/ui/money-value'
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmSuccessId, setConfirmSuccessId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'description' | 'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterType, setFilterType] = useState<'all' | 'recurring' | 'one-time'>('one-time')
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

  const recurringTxns = transactions.filter((t: TransactionResponse) => t.is_recurring)
  const oneTimeTxns = transactions.filter((t: TransactionResponse) => !t.is_recurring)

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

  const hasActiveFilters = filterCategory !== 'all' || filterType !== 'one-time'

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
    onSuccess: (_, id) => {
      setConfirmSuccessId(id)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
      toast.success('Payment confirmed')
      setTimeout(() => {
        setConfirmSuccessId(null)
        setConfirmingId(null)
      }, 2000)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to confirm payment')
      setConfirmingId(null)
    },
  })

  const handleConfirmClick = (id: string) => {
    setConfirmingId(id)
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
          setFilterType('one-time')
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
        ) : 
          (recurringTxns.length > 0 || oneTimeTxns.length > 0) ? (
          <>
            <div className="sm:hidden flex flex-col gap-3">
              {filteredAndSortedTxns.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No transactions match your filters
                  </CardContent>
                </Card>
              ) : (
                filteredAndSortedTxns.map((txn: TransactionResponse) => (
                  <Card key={txn.id}>
                    <CardContent className="py-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{txn.description}</div>
                          <div className="text-sm text-muted-foreground">
                            {txn.category} · {txn.is_recurring ? txn.frequency : 'one-time'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {txn.is_recurring
                              ? (txn.next_occurrence
                                ? formatDate(txn.next_occurrence)
                                : (txn.anchor_date ? formatDate(txn.anchor_date) : '-'))
                              : formatDate(txn.timestamp)}
                          </div>
                        </div>
                        <MoneyValue
                          amount={txn.amount}
                          currency={currentAccountCurrency}
                          showSign="always"
                          tone="auto"
                          className="font-semibold"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {txn.is_recurring ? (
                          <MobileActionButton
                            onClick={() => handleConfirmClick(txn.id)}
                            icon={Check}
                            label="Confirm"
                            variant={confirmSuccessId === txn.id ? 'default' : 'outline'}
                            disabled={confirmingId === txn.id}
                          />
                        ) : <div />}
                        <MobileActionButton
                          onClick={() => handleEditClick(txn)}
                          icon={Edit2}
                          label="Edit"
                          variant="outline"
                        />
                        <MobileActionButton
                          onClick={() => setConfirmDelete(txn.id)}
                          icon={Trash2}
                          label="Delete"
                          variant="outline"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <div className="hidden sm:block border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">
                      <button 
                        onClick={() => {
                          if (sortField === 'description') {
                            setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortField('description')
                            setSortDir('asc')
                          }
                        }}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        Description
                        {sortField === 'description' && (
                          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        )}
                      </button>
                    </th>
                    <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">
                      <button 
                        onClick={() => {
                          if (sortField === 'date') {
                            setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortField('date')
                            setSortDir('desc')
                          }
                        }}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        When
                        {sortField === 'date' && (
                          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        )}
                      </button>
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      <button 
                        onClick={() => {
                          if (sortField === 'amount') {
                            setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortField('amount')
                            setSortDir('desc')
                          }
                        }}
                        className="inline-flex items-center gap-1 ml-auto hover:text-foreground"
                      >
                        Amount
                        {sortField === 'amount' && (
                          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        )}
                      </button>
                    </th>
                    <th className="text-right px-3 py-2 font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAndSortedTxns.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        No transactions match your filters
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedTxns.map((txn: TransactionResponse) => (
                      <tr key={txn.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="font-medium truncate max-w-[150px]">{txn.description}</div>
                          <div className="text-xs text-muted-foreground hidden sm:block">
                            {txn.category} · {txn.is_recurring ? `${txn.frequency} · next ${txn.next_occurrence ? formatDate(txn.next_occurrence) : (txn.anchor_date ? formatDate(txn.anchor_date) : '-')}` : formatDate(txn.timestamp)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                          {txn.is_recurring 
                            ? (txn.next_occurrence
                              ? formatDate(txn.next_occurrence)
                              : (txn.anchor_date ? formatDate(txn.anchor_date) : '-'))
                            : formatDate(txn.timestamp)
                          }
                        </td>
                        <td className="px-3 py-2 text-right">
                          <MoneyValue
                            amount={txn.amount}
                            currency={currentAccountCurrency}
                            showSign="always"
                            tone="auto"
                            className="font-medium"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-end">
                            {txn.is_recurring && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    onClick={() => handleConfirmClick(txn.id)}
                                    variant={confirmSuccessId === txn.id ? "default" : "ghost"}
                                    size="icon"
                                    className="h-9 w-9"
                                    disabled={confirmingId === txn.id}
                                    aria-label="Confirm Paid"
                                  >
                                    <Check size={14} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Confirm Paid</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => handleEditClick(txn)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9"
                                  aria-label="Edit transaction"
                                >
                                  <Edit2 size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit transaction</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => setConfirmDelete(txn.id)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9"
                                  aria-label="Delete transaction"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete transaction</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
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

      <div className="sm:hidden fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] left-4 right-4 z-30">
        <Button onClick={handleCreateClick} className="h-12 w-full shadow-lg">
          <Plus size={18} />
          New Transaction
        </Button>
      </div>
    </div>
  )
}
