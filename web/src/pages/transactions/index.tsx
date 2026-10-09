import { useState, useContext, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, ArrowLeftRight, Users, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditSheet } from '@/components/EditSheet'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionFilters } from '@/components/TransactionFilters'
import type { TransactionResponse } from '@/lib/api'
import { fromDateInputValue, toDateInputValue } from '@/lib/locale'
import { getWindowBounds, isCurrentDue } from '@/lib/transactions-impact'
import { AccountContext } from '@/App'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { emptyFormData, type FormData, type FormErrors } from './types'
import { useTransactionsData } from './useTransactionsData'
import { useTransactionFilters } from './useTransactionFilters'
import { useTransactionMutations } from './useTransactionMutations'
import { usePeerDebts } from './usePeerDebts'
import { ImpactCard, ActiveFilterBadges, TransactionList } from './TransactionsTabParts'
import { FriendDebtsTab, FriendDebtSheets } from './FriendDebts'
import { LedgerTab } from './LedgerTab'

export function TransactionsPage() {
  const { selectedAccountId } = useContext(AccountContext)
  const [activeTab, setActiveTab] = useState<'transactions' | 'friend-debts' | 'ledger'>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'ledger' || tab === 'friend-debts') return tab
    return 'transactions'
  })
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(emptyFormData(''))
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [amountText, setAmountText] = useState('')

  const {
    accounts,
    accountsLoading,
    currentAccountId,
    currentAccountCurrency,
    transactions,
    txnsLoading,
    isError,
    paySchedules,
    friends,
    ledgerEntries,
    nextPayday,
    windowLabels,
    unconfirmedImpact,
  } = useTransactionsData(selectedAccountId)

  const filters = useTransactionFilters(currentAccountId, transactions, nextPayday, paySchedules)
  const {
    preset, setPreset, sortField, setSortField, sortDir, setSortDir, showFilters, setShowFilters,
    searchQuery, setSearchQuery, amountMin, setAmountMin, amountMax, setAmountMax,
    filteredAndSortedTxns, hasActiveFilters, handleClearFilters,
  } = filters

  const debts = usePeerDebts(transactions)

  const resetForm = () => {
    setFormData(emptyFormData(currentAccountId))
    setFormErrors({})
    setAmountText('')
  }

  const { createMutation, updateMutation, deleteMutation, confirmMutation, confirmInstallmentMutation } =
    useTransactionMutations(
      currentAccountId,
      () => { setIsCreating(false); resetForm() },
      () => { setEditingId(null); resetForm() },
    )

  const handleConfirmClick = (id: string) => {
    const txn = transactions.find((t: TransactionResponse) => t.id === id)
    if (txn?.is_installment) {
      confirmInstallmentMutation.mutate(id)
    } else {
      confirmMutation.mutate(id)
    }
  }

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
    resetForm()
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
    resetForm()
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const txnToDelete = transactions.find((t: TransactionResponse) => t.id === confirmDelete)

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
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <History size={14} className="inline mr-1.5 -mt-0.5" />
          Recent activity
        </button>
      </div>

      {activeTab === 'transactions' && (
        <>
          <ImpactCard
            unconfirmedImpact={unconfirmedImpact}
            currentAccountCurrency={currentAccountCurrency}
            onConfirmAll={handleBatchConfirmDueNow}
          />

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
            <ActiveFilterBadges
              preset={preset}
              windowLabels={windowLabels}
              searchQuery={searchQuery}
              amountMin={amountMin}
              amountMax={amountMax}
              setPreset={setPreset}
              setSearchQuery={setSearchQuery}
              setAmountMin={setAmountMin}
              setAmountMax={setAmountMax}
              handleClearFilters={handleClearFilters}
            />
          )}

          <TransactionList
            transactions={transactions}
            filteredAndSortedTxns={filteredAndSortedTxns}
            txnsLoading={txnsLoading}
            currentAccountCurrency={currentAccountCurrency}
            handleCreateClick={handleCreateClick}
            handleConfirmClick={handleConfirmClick}
            setConfirmDelete={setConfirmDelete}
            handleEditClick={handleEditClick}
          />
        </>
      )}

      {activeTab === 'friend-debts' && (
        <FriendDebtsTab debts={debts} friends={friends} currentAccountCurrency={currentAccountCurrency} txnsLoading={txnsLoading} />
      )}

      {activeTab === 'ledger' && (
        <LedgerTab ledgerEntries={ledgerEntries} currentAccountCurrency={currentAccountCurrency} />
      )}

      <FriendDebtSheets debts={debts} friends={friends} accountId={currentAccountId} />

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
