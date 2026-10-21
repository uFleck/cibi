import { useState, useContext, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ArrowLeftRight, Banknote, Check, CircleHelp, Pencil, SkipForward, Trash2, X, Users, History } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader, pageShell } from '@/components/ui/page-header'
import { Chip } from '@/components/ui/chip'
import { DateInput } from '@/components/ui/date-input'
import { DataList } from '@/components/ui/data-list'
import { ROW_KEYS, type RowAction } from '@/lib/row-actions'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useBillActions } from '@/components/bills/useBillActions'
import { EditSheet } from '@/components/EditSheet'
import { AccountSelector } from '@/components/AccountSelector'
import { PaydayBanner } from '@/components/PaydayBanner'
import { PaySchedulesPanel } from '@/components/PaySchedulesPanel'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionLinks } from '@/components/TransactionLinks'
import { TransactionFilters, type TransactionPreset } from '@/components/TransactionFilters'
import {
  fetchAccounts,
  fetchTransactions,
  listPaySchedules,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  effectiveAmount,
  listFriends,
  confirmDebt,
  deletePeerDebt,
  createPeerDebt,
  updatePeerDebt,
  fetchLedger,
  type TransactionLink,
  type TransactionResponse,
  type FriendResponse,
  type CreatePeerDebtRequest,
  type LedgerEntryResponse,
} from '@/lib/api'
import { asNeededBudget, asNeededSpent } from '@/lib/bills'
import { formatDate, formatMoney } from '@/lib/format'
import { cleanLinks } from '@/lib/links'
import { fromDateInputValue, toDateInputValue } from '@/lib/locale'
import { getWindowLabels, matchesPresetFilter } from '@/lib/transactions-impact'
import { AccountContext } from '@/App'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { focusWhenReady, useShellAction } from '@/shell/shellActions'
import { usePublishSelection, useSelection, type SelectionDetail } from '@/shell/selection'
import { frequencyLabel } from '@/lib/labels'

type KindFilter = 'all' | 'income' | 'expense' | 'recurring'

const KIND_CHIPS: { value: KindFilter; label: string; shortcut: string }[] = [
  { value: 'all', label: 'Todas', shortcut: '1' },
  { value: 'income', label: 'Entradas', shortcut: '2' },
  { value: 'expense', label: 'Saídas', shortcut: '3' },
  { value: 'recurring', label: 'Recorrente', shortcut: '4' },
]

function matchesKind(txn: TransactionResponse, kind: KindFilter) {
  if (kind === 'income') return txn.amount > 0
  if (kind === 'expense') return txn.amount < 0
  if (kind === 'recurring') return txn.is_recurring
  return true
}

function canConfirmTxn(txn: TransactionResponse) {
  return txn.is_installment
    ? (txn.paid_installments ?? 0) < (txn.total_installments ?? 0)
    : txn.is_recurring || (txn.requires_confirmation && !txn.confirmed_at)
}

/** A recurring bill with a date that can be skipped: not an as-needed one, which has no date. */
function canSkipTxn(txn: TransactionResponse) {
  return txn.is_recurring && !txn.is_as_needed && txn.next_occurrence !== null
}

function txnStatusLabel(txn: TransactionResponse) {
  if (txn.is_installment) return `Parcela ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'}`
  if (txn.is_uncertain) return 'Não sei'
  if (txn.is_as_needed) return 'Quando precisar'
  if (txn.is_recurring) return 'Recorrente'
  if (txn.requires_confirmation) return txn.confirmed_at ? 'Pagamento pendente · confirmado' : 'Pagamento pendente'
  return 'Avulsa'
}

interface FormData {
  account_id: string
  amount: number
  title: string
  description: string
  links: TransactionLink[]
  category?: string
  is_recurring?: boolean
  frequency?: string
  anchor_date?: string
  requires_confirmation?: boolean
  is_installment?: boolean
  total_installments?: number
  estimate_source?: string
  estimate_key?: string
  is_uncertain?: boolean
  is_as_needed?: boolean
}

type FormErrors = Partial<Record<keyof FormData, string>>

export function TransactionsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [activeTab, setActiveTab] = useState<'transactions' | 'friend-debts' | 'pay-schedules' | 'ledger'>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'ledger' || tab === 'friend-debts' || tab === 'pay-schedules') return tab
    return 'transactions'
  })
  const [isCreating, setIsCreating] = useState(false)
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [peerDebtFilter, setPeerDebtFilter] = useState<{ friendId: string; direction: 'all' | 'i-owe' | 'they-owe'; status: 'all' | 'confirmed' | 'pending' }>({ friendId: 'all', direction: 'all', status: 'all' })
  const [isCreatingDebt, setIsCreatingDebt] = useState(false)
  const [debtForm, setDebtForm] = useState({
    friend_id: '',
    amount: '',
    title: '',
    date: new Date().toISOString().slice(0, 10),
  })
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null)
  const [editDebtDraft, setEditDebtDraft] = useState({ amount: '', title: '' })
  const [formData, setFormData] = useState<FormData>({
    account_id: '',
    amount: 0,
    title: '',
    description: '',
    links: [],
    is_recurring: false,
    frequency: 'monthly',
    anchor_date: '',
    category: '',
    requires_confirmation: false,
    is_installment: false,
    total_installments: undefined,
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [amountText, setAmountText] = useState('')
  const [sortField, setSortField] = useState<'title' | 'date' | 'amount'>('date')
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
  const billActions = useBillActions(currentAccountCurrency)

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

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: listFriends,
  })

  const { data: ledgerEntries = [] } = useQuery({
    queryKey: ['ledger', currentAccountId],
    queryFn: () => fetchLedger(currentAccountId!),
    enabled: !!currentAccountId,
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

    txns = txns.filter(t => matchesKind(t, kindFilter))

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      txns = txns.filter(t => t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q))
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
      if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title)
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
  }, [transactions, preset, kindFilter, sortField, sortDir, nextPayday, paySchedules, searchQuery, amountMin, amountMax])

  const hasActiveFilters = preset !== null || kindFilter !== 'all' || !!searchQuery.trim() || !!(amountMin || amountMax)

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
      toast.success('Transação criada')
      setIsCreating(false)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        title: '',
        description: '',
        links: [],
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
        category: '',
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
      toast.error((error as Error).message || 'Não deu para criar a transação')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
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
      toast.success('Transação atualizada')
      setEditingId(null)
      setFormData({
        account_id: currentAccountId,
        amount: 0,
        title: '',
        description: '',
        links: [],
        is_recurring: false,
        frequency: 'monthly',
        anchor_date: '',
        category: '',
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
      toast.error((error as Error).message || 'Não deu para atualizar a transação')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
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
      const deletedName = deletedTxn?.title ?? 'Transação'
      toast(`${deletedName} excluída`, {
        action: {
          label: 'Desfazer',
          onClick: () => {
            if (deletedTxn) {
              createMutation.mutate({
                account_id: deletedTxn.account_id,
                amount: deletedTxn.amount,
                title: deletedTxn.title,
                description: deletedTxn.description ?? '',
                links: deletedTxn.links,
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
      toast.error((error as Error).message || 'Não deu para excluir a transação')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account', currentAccountId] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
    },
  })

  const handleConfirmClick = (id: string) => {
    const txn = transactions.find((t: TransactionResponse) => t.id === id)
    if (txn) billActions.pay(txn)
  }

  /** Skip and "not sure", for the list rows and the inspector. */
  const billRowActions = (txn: TransactionResponse): RowAction[] => [
    ...(canSkipTxn(txn)
      ? [{ id: 'skip', label: 'Pular este mês', icon: SkipForward, keys: ROW_KEYS.skip, variant: 'outline' as const, run: () => billActions.skip(txn) }]
      : []),
    ...(txn.is_recurring
      ? [{
          id: 'uncertain',
          label: txn.is_uncertain ? 'Voltar para a conta' : 'Não sei',
          icon: CircleHelp,
          keys: ROW_KEYS.uncertain,
          variant: 'outline' as const,
          run: () => billActions.toggleUncertain(txn),
        }]
      : []),
  ]

  const handleClearFilters = useCallback(() => {
    setPreset(null)
    setKindFilter('all')
    setSearchQuery('')
    setAmountMin('')
    setAmountMax('')
  }, [])

  const confirmPeerDebtMutation = useMutation({
    mutationFn: (id: string) => confirmDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Dívida confirmada')
    },
    onError: () => toast.error('Não deu para confirmar a dívida'),
  })

  const deletePeerDebtMutation = useMutation({
    mutationFn: (id: string) => deletePeerDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Dívida excluída')
    },
    onError: () => toast.error('Não deu para excluir a dívida'),
  })

  const updateDebtMutation = useMutation({
    mutationFn: ({ id, amount, title }: { id: string; amount: number; title: string }) =>
      updatePeerDebt(id, { amount, title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Dívida atualizada')
      setEditingDebtId(null)
    },
    onError: () => toast.error('Não deu para atualizar a dívida'),
  })

  const createDebtMutation = useMutation({
    mutationFn: (data: CreatePeerDebtRequest) => createPeerDebt(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Dívida criada')
      setIsCreatingDebt(false)
      setDebtForm({ friend_id: '', amount: '', title: '', date: new Date().toISOString().slice(0, 10) })
    },
    onError: () => toast.error('Não deu para criar a dívida'),
  })

  const handleCreateClick = () => {
    setIsCreating(true)
    setEditingId(null)
    setFormErrors({})
    setAmountText('')
    setFormData({
      account_id: currentAccountId,
      amount: 0,
      title: '',
      description: '',
      links: [],
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
      category: '',
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
      title: txn.title,
      description: txn.description ?? '',
      links: txn.links,
      is_recurring: txn.is_recurring,
      frequency: txn.frequency || 'monthly',
      anchor_date: toDateInputValue(txn.anchor_date),
      category: txn.category ?? '',
      requires_confirmation: txn.requires_confirmation,
      is_installment: txn.is_installment,
      total_installments: txn.total_installments ?? undefined,
      estimate_source: txn.estimate_source ?? '',
      estimate_key: txn.estimate_key ?? '',
      is_uncertain: txn.is_uncertain ?? false,
      is_as_needed: txn.is_as_needed ?? false,
    })
  }

  const validate = (): boolean => {
    const errors: FormErrors = {}
    if (!formData.title.trim()) errors.title = 'Título é obrigatório'
    if (formData.amount === 0) errors.amount = 'O valor não pode ser zero'
    if (formData.is_recurring && formData.estimate_source && !formData.estimate_key?.trim()) {
      errors.estimate_key = 'Diga a categoria ou o texto para estimar'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    // An as-needed bill has no due date, but a recurring row needs an anchor: today stands in.
    const anchorDate = fromDateInputValue(formData.anchor_date)
      ?? (formData.is_recurring && formData.is_as_needed ? fromDateInputValue(toDateInputValue(new Date().toISOString())) : undefined)
    // Only a recurring expense can be estimated; an empty source and key make the amount fixed.
    const asNeeded = !!formData.is_recurring && !!formData.is_as_needed
    const estimated = !asNeeded && !!formData.is_recurring && !!formData.estimate_source && !!formData.estimate_key?.trim()
    const payload = {
      ...formData,
      anchor_date: anchorDate,
      links: cleanLinks(formData.links),
      estimate_source: estimated ? formData.estimate_source : '',
      estimate_key: estimated ? formData.estimate_key?.trim() : '',
      is_as_needed: asNeeded,
      is_uncertain: !!formData.is_recurring && !!formData.is_uncertain,
    }
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
      title: '',
      description: '',
      links: [],
      is_recurring: false,
      frequency: 'monthly',
      anchor_date: '',
      category: '',
      requires_confirmation: false,
      is_installment: false,
      total_installments: undefined,
    })
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const txnToDelete = transactions.find((t: TransactionResponse) => t.id === confirmDelete)

  // Filter state persistence
  const FILTER_KEY = `cibi:filters:${currentAccountId}`
  const [filtersLoadedFor, setFiltersLoadedFor] = useState<string | undefined>(undefined)
  if (currentAccountId && filtersLoadedFor !== currentAccountId) {
    setFiltersLoadedFor(currentAccountId)
    try {
      const saved = sessionStorage.getItem(FILTER_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.preset !== undefined) setPreset(state.preset as TransactionPreset | null)
        if (state.sortField) setSortField(state.sortField)
        if (state.sortDir) setSortDir(state.sortDir)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!currentAccountId) return
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      preset, sortField, sortDir,
    }))
  }, [preset, sortField, sortDir, currentAccountId, FILTER_KEY])

  const handleTransactionChange = (changes: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...changes }))
  }

  const handleTransactionAmountParsed = (parsed: number | null) => {
    setFormData(prev => ({ ...prev, amount: parsed ?? 0 }))
  }

  const focusSearch = () => focusWhenReady('[data-filter-search]')
  useShellAction('new-transaction', activeTab === 'pay-schedules' ? () => setIsCreatingSchedule(true) : handleCreateClick)
  useShellAction('focus-search', focusSearch)

  const { selectedId, select } = useSelection()

  const [initialSelect] = useState(() => new URLSearchParams(window.location.search).get('select'))
  useEffect(() => {
    if (initialSelect) select(initialSelect)
  }, [initialSelect, select])

  const selectedTxn = selectedId ? filteredAndSortedTxns.find(t => t.id === selectedId) : undefined
  usePublishSelection(selectedTxn ? transactionDetail(selectedTxn) : null)

  useKeyboardShortcuts([
    { keys: 'f', label: 'Buscar', group: 'Transações', scope: 'list', run: focusSearch },
    ...KIND_CHIPS.map(chip => ({
      keys: chip.shortcut,
      label: chip.label,
      group: 'Transações',
      scope: 'list' as const,
      run: () => setKindFilter(chip.value),
    })),
  ])

  function transactionDetail(txn: TransactionResponse): SelectionDetail {
    const due = txn.requires_confirmation && !txn.confirmed_at
    const dateValue = txn.is_recurring ? txn.next_occurrence || txn.anchor_date : txn.anchor_date || txn.timestamp
    const rows: SelectionDetail['rows'] = [
      { label: 'Conta', value: accounts.find(a => a.id === txn.account_id)?.name ?? '-' },
      { label: 'Categoria', value: txn.category ?? '-' },
      { label: txn.is_recurring ? 'Próximo' : 'Data', value: <span className="num">{dateValue ? formatDate(dateValue) : '-'}</span> },
    ]
    if (txn.is_installment) {
      const totalInstallments = txn.total_installments ?? 0
      const remaining = totalInstallments - (txn.paid_installments ?? 0)
      rows.push({ label: 'Por parcela', value: <span className="num">{formatMoney(txn.amount, currentAccountCurrency)}</span> })
      rows.push({ label: 'Restante', value: <span className="num">{formatMoney(txn.amount * remaining, currentAccountCurrency)}</span> })
    }
    if (txn.is_recurring && !txn.is_as_needed) rows.push({ label: 'Frequência', value: frequencyLabel(txn.frequency ?? '-') })
    if (txn.is_as_needed) {
      rows.push({
        label: 'Este mês',
        value: (
          <span className="num">
            {formatMoney(asNeededSpent(txn), currentAccountCurrency)} de {formatMoney(asNeededBudget(txn), currentAccountCurrency)}
          </span>
        ),
      })
    }
    if (txn.is_uncertain) rows.push({ label: 'Previsão', value: 'Fora da conta até pagar ou decidir' })
    if (txn.estimate_source) {
      rows.push({
        label: 'Estimativa',
        value: `${txn.estimate_source === 'category' ? 'Categoria' : 'Texto'} "${txn.estimate_key ?? ''}" · ${
          txn.estimate_samples ? `mediana de ${txn.estimate_samples}` : 'sem histórico ainda, usando o valor definido'
        }`,
      })
    }
    if (txn.description) {
      rows.push({ label: 'Descrição', value: <span className="whitespace-pre-wrap break-words">{txn.description}</span> })
    }
    if (txn.links.length > 0) rows.push({ label: 'Links', value: <TransactionLinks links={txn.links} /> })
    if (txn.requires_confirmation) {
      rows.push({ label: 'Confirmado', value: <span className="num">{txn.confirmed_at ? formatDate(txn.confirmed_at) : 'Ainda não'}</span> })
    }
    const actions: SelectionDetail['actions'] = [
      { id: 'edit', label: 'Editar', icon: Pencil, keys: ROW_KEYS.edit, variant: 'default', run: () => handleEditClick(txn) },
      { id: 'delete', label: 'Excluir', icon: Trash2, keys: ROW_KEYS.delete, variant: 'destructive', run: () => setConfirmDelete(txn.id) },
    ]
    actions.unshift(...billRowActions(txn))
    if (canConfirmTxn(txn)) {
      actions.unshift({ id: 'paid', label: 'Marcar como pago', icon: Check, keys: ROW_KEYS.confirm, variant: 'outline', run: () => handleConfirmClick(txn.id) })
    }
    return {
      id: txn.id,
      title: txn.title,
      eyebrow: due ? `Vence ${formatDate(txn.anchor_date || txn.timestamp)}` : formatDate(txn.timestamp),
      amount: <MoneyValue amount={txn.is_installment ? txn.amount * (txn.total_installments ?? 0) : effectiveAmount(txn)} currency={currentAccountCurrency} showSign="always" tone="auto" />,
      badge: txnStatusLabel(txn),
      rows,
      actions,
    }
  }

  if (isError || accountsLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center text-destructive">
          {isError ? 'Não deu para carregar as transações.' : 'Carregando contas...'}
        </div>
      </div>
    )
  }

  return (
    <div className={pageShell}>
      <ConfirmDialog
        open={!!confirmDelete}
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
        title={`Excluir "${txnToDelete?.title}"?`}
        description="Não dá para desfazer."
      />

      {billActions.dialog}

      <PageHeader
        eyebrow="Extrato"
        title="Transações"
        description={`Registre, agende e revise as entradas e saídas${currentAccount ? ` de ${currentAccount.name}` : ''}.`}
        actions={
          activeTab === 'transactions' ? (
            <Button onClick={handleCreateClick} size="sm" className="hidden sm:inline-flex">
              <Plus size={16} />
              Adicionar transação
            </Button>
          ) : activeTab === 'friend-debts' ? (
            <Button onClick={() => setIsCreatingDebt(true)} size="sm">
              <Plus size={16} />
              Nova dívida
            </Button>
          ) : activeTab === 'pay-schedules' ? (
            <Button onClick={() => setIsCreatingSchedule(true)} size="sm">
              <Plus size={16} />
              Novo recebimento
            </Button>
          ) : null
        }
      />

      <PaydayBanner schedules={paySchedules} />

      <div className="flex gap-1 border-b">
        <button
          onClick={() => { setActiveTab('transactions'); select(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'transactions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <ArrowLeftRight size={14} className="inline mr-1.5 -mt-0.5" />
          Transações
        </button>
        <button
          onClick={() => { setActiveTab('friend-debts'); select(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'friend-debts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Users size={14} className="inline mr-1.5 -mt-0.5" />
          Dívidas com amigos
        </button>
        <button
          onClick={() => { setActiveTab('pay-schedules'); select(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pay-schedules' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Banknote size={14} className="inline mr-1.5 -mt-0.5" />
          Recebimentos
        </button>
        <button
          onClick={() => { setActiveTab('ledger'); select(null) }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <History size={14} className="inline mr-1.5 -mt-0.5" />
          Atividade recente
        </button>
      </div>

      {activeTab === 'transactions' && <>
      <div className="flex flex-wrap items-center gap-2">
        {KIND_CHIPS.map(chip => (
          <Chip key={chip.value} active={kindFilter === chip.value} shortcut={chip.shortcut} onClick={() => setKindFilter(chip.value)}>
            {chip.label}
          </Chip>
        ))}
        <span className="flex-1" />
        <AccountSelector selectedAccountId={selectedAccountId} onSelectAccount={setSelectedAccountId} compact />
      </div>

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
          <span className="text-xs text-muted-foreground mr-1">Filtros:</span>
          {preset !== null && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setPreset(null)}>
              {preset === 'due-now' ? windowLabels?.dueNowLabel :
               preset === 'current-window' ? windowLabels?.currentWindowLabel :
               preset === 'next-window' ? windowLabels?.nextWindowLabel :
               preset === 'all-recurring' ? 'Todas recorrentes' :
               preset === 'one-time-only' ? 'Só avulsas' : preset}
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
            Limpar filtros
          </Button>
        </div>
      )}

      <Skeleton
        name="transaction-list"
        loading={txnsLoading}
        fallback={
          <div className="flex flex-col gap-2" role="status" aria-label="Carregando transações">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
            ))}
            <span className="sr-only">Carregando...</span>
          </div>
        }
      >
{transactions.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <ArrowLeftRight className="mx-auto mb-4 text-muted-foreground/40" size={40} />
              <p className="text-muted-foreground mb-4">Nenhuma transação ainda</p>
              <Button onClick={handleCreateClick} size="sm">
                <Plus size={16} />
                Criar primeira transação
              </Button>
            </CardContent>
          </Card>
        ) : (
          <SharedDebtList
            mode="auto"
            view="owner"
            items={filteredAndSortedTxns.map((txn: TransactionResponse) => ({
              id: txn.id,
              title: txn.title,
              category: txn.category,
              subtitle: txn.is_installment
                ? `Parcela ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'} paga · próximo ${txn.next_occurrence ? formatDate(txn.next_occurrence) : '-'}`
                : txn.is_recurring
                  ? `${frequencyLabel(txn.frequency ?? '')} · próximo ${txn.next_occurrence ? formatDate(txn.next_occurrence) : (txn.anchor_date ? formatDate(txn.anchor_date) : '-')}`
                  : txn.requires_confirmation
                    ? (txn.confirmed_at ? `confirmado ${formatDate(txn.confirmed_at)}` : `pendente ${formatDate(txn.anchor_date || txn.timestamp)}`)
                    : formatDate(txn.timestamp),
              amount: txn.is_installment ? txn.amount : effectiveAmount(txn),
              currency: currentAccountCurrency,
              status: {
                label: txn.is_installment
                  ? `Parcela ${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'}`
                  : txn.is_uncertain
                    ? 'Não sei'
                    : txn.is_as_needed
                    ? 'Quando precisar'
                    : txn.is_recurring
                    ? (txn.estimate_source ? 'Recorrente · estimado' : 'Recorrente')
                    : txn.requires_confirmation
                      ? (txn.confirmed_at ? 'Pagamento pendente · confirmado' : 'Pagamento pendente')
                      : 'Avulsa',
                tone: (txn.is_installment || txn.is_recurring || txn.requires_confirmation)
                  ? 'default'
                  : 'secondary',
              },
              type: 'transaction' as const,
              canConfirm: txn.is_installment
                ? (txn.paid_installments ?? 0) < (txn.total_installments ?? 0)
                : txn.is_recurring || (txn.requires_confirmation && !txn.confirmed_at),
              canDelete: true,
              canEdit: true,
            }))}
            emptyTitle="Nenhuma transação corresponde aos filtros"
            emptyHint="Ajuste os filtros e tente de novo"
            onConfirm={handleConfirmClick}
            extraActionsFor={id => {
              const txn = transactions.find((t: TransactionResponse) => t.id === id)
              return txn ? billRowActions(txn) : []
            }}
            onDelete={setConfirmDelete}
            selectedId={selectedId}
            onSelect={select}
            onEdit={(id) => {
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
              <span className="text-xs text-muted-foreground">Amigo</span>
              <Select value={peerDebtFilter.friendId} onValueChange={v => setPeerDebtFilter(f => ({ ...f, friendId: v }))}>
                <SelectTrigger className="h-9 min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os amigos</SelectItem>
                  {friends.map((fr: FriendResponse) => (
                    <SelectItem key={fr.id} value={fr.id}>{fr.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Direção</span>
              <Select value={peerDebtFilter.direction} onValueChange={v => setPeerDebtFilter(f => ({ ...f, direction: v as typeof f.direction }))}>
                <SelectTrigger className="h-9 min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="i-owe">Eu devo</SelectItem>
                  <SelectItem value="they-owe">Me devem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Situação</span>
              <Select value={peerDebtFilter.status} onValueChange={v => setPeerDebtFilter(f => ({ ...f, status: v as typeof f.status }))}>
                <SelectTrigger className="h-9 min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                </SelectContent>
              </Select>
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
                const friendName = friends.find((f: FriendResponse) => f.id === txn.friend_id)?.name ?? 'Desconhecido'
                const isConfirmed = txn.confirmed_at !== null
                const direction = txn.amount < 0 ? 'Eu devo' : 'Me devem'
                return {
                  id: txn.id,
                  title: txn.title,
                  subtitle: `${friendName} · ${direction} · ${isConfirmed ? `confirmado ${formatDate(txn.confirmed_at!)}` : `pendente ${formatDate(txn.anchor_date || txn.timestamp)}`}`,
                  amount: txn.is_installment && txn.total_installments
                    ? txn.amount / txn.total_installments
                    : txn.amount,
                  currency: currentAccountCurrency,
                  status: {
                    label: isConfirmed ? 'Confirmado' : (txn.is_installment ? `${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'} paga` : 'Pendente'),
                    tone: isConfirmed ? 'default' as const : 'outline' as const,
                  },
                  canConfirm: !isConfirmed,
                  canEdit: true,
                  canDelete: true,
                }
              })}
              emptyTitle="Nenhuma dívida com amigos"
              emptyHint="Ajuste os filtros ou clique em Nova dívida"
              onConfirm={(id) => confirmPeerDebtMutation.mutate(id)}
              onEdit={(id) => {
                const txn = filteredPeerDebts.find((t: TransactionResponse) => t.id === id)
                if (!txn) return
                setEditDebtDraft({
                  amount: String(Math.abs(txn.amount)),
                  title: txn.title,
                })
                setEditingDebtId(id)
              }}
              onDelete={(id) => deletePeerDebtMutation.mutate(id)}
            />
          </Skeleton>
        </div>
      )}

      {activeTab === 'pay-schedules' && currentAccountId && (
        <PaySchedulesPanel
          accountId={currentAccountId}
          currency={currentAccountCurrency}
          schedules={paySchedules}
          creating={isCreatingSchedule}
          onCreatingChange={setIsCreatingSchedule}
        />
      )}

      {activeTab === 'ledger' && (
        <div className="flex flex-col gap-1">
          {ledgerEntries.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="mx-auto mb-4 text-muted-foreground/40" size={40} />
                <p className="text-muted-foreground">Nenhuma atividade ainda</p>
              </CardContent>
            </Card>
          ) : (
            <DataList
              aria-label="Atividade recente"
              rows={ledgerEntries}
              rowId={(entry: LedgerEntryResponse) => entry.id}
              columns={[
                {
                  id: 'date',
                  header: 'Data',
                  className: 'w-[18%]',
                  cell: (entry: LedgerEntryResponse) => <span className="num text-muted-foreground">{formatDate(entry.posted_at)}</span>,
                },
                { id: 'description', header: 'Descrição', cell: (entry: LedgerEntryResponse) => entry.description },
                {
                  id: 'amount',
                  header: 'Valor',
                  align: 'right',
                  numeric: true,
                  className: 'w-[24%]',
                  cell: (entry: LedgerEntryResponse) => (
                    <span className={entry.amount >= 0 ? 'text-pos' : 'text-neg'}>
                      {entry.amount >= 0 ? '+' : ''}{formatMoney(entry.amount, currentAccountCurrency)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      )}

      <EditSheet
        open={isCreatingDebt}
        onOpenChange={(open) => !open && setIsCreatingDebt(false)}
        title="Nova dívida com amigo"
        description="Registre uma dívida com um amigo."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!debtForm.friend_id || !debtForm.amount || !debtForm.title) return
            const amt = parseFloat(debtForm.amount)
            if (isNaN(amt) || amt === 0) return
            createDebtMutation.mutate({
              account_id: currentAccountId!,
              friend_id: debtForm.friend_id,
              amount: Math.round(amt * 100),
              title: debtForm.title,
              date: debtForm.date || new Date().toISOString(),
            })
          }}
        >
          <div className="flex flex-col gap-1">
            <Label>Amigo</Label>
            <Select value={debtForm.friend_id} onValueChange={v => setDebtForm(f => ({ ...f, friend_id: v }))}>
              <SelectTrigger className="w-full h-9" aria-label="Amigo">
                <SelectValue placeholder="Escolha um amigo..." />
              </SelectTrigger>
              <SelectContent>
                {friends.map((fr: FriendResponse) => (
                  <SelectItem key={fr.id} value={fr.id}>{fr.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Valor</Label>
            <p className="text-xs text-muted-foreground">Positivo: ele deve para você. Negativo: você deve para ele.</p>
            <Input
              type="number"
              step="0.01"
              placeholder="ex. 50.00 ou -30.00"
              value={debtForm.amount}
              onChange={e => setDebtForm(f => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Título</Label>
            <Input
              placeholder="ex. Jantar, ingressos de cinema"
              value={debtForm.title}
              onChange={e => setDebtForm(f => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Data</Label>
            <DateInput
              value={debtForm.date}
              onChange={date => setDebtForm(f => ({ ...f, date }))}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setIsCreatingDebt(false)}>Cancelar</Button>
            <Button type="submit" disabled={createDebtMutation.isPending}>
              {createDebtMutation.isPending ? 'Salvando...' : 'Criar dívida'}
            </Button>
          </div>
        </form>
      </EditSheet>

      <EditSheet
        open={!!editingDebtId}
        onOpenChange={(open) => !open && setEditingDebtId(null)}
        title="Editar dívida com amigo"
        description="Atualize o valor ou o título."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const amt = parseFloat(editDebtDraft.amount)
            if (isNaN(amt) || amt === 0) return
            const txn = filteredPeerDebts.find((t: TransactionResponse) => t.id === editingDebtId)
            const signed = txn && txn.amount < 0 ? -Math.abs(amt) : Math.abs(amt)
            updateDebtMutation.mutate({
              id: editingDebtId!,
              amount: Math.round(signed * 100),
              title: editDebtDraft.title,
            })
          }}
        >
          <div className="flex flex-col gap-1">
            <Label>Título</Label>
            <Input
              value={editDebtDraft.title}
              onChange={e => setEditDebtDraft(d => ({ ...d, title: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Valor</Label>
            <p className="text-xs text-muted-foreground">Digite um número positivo. O sinal (quem deve a quem) é mantido.</p>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={editDebtDraft.amount}
              onChange={e => setEditDebtDraft(d => ({ ...d, amount: e.target.value }))}
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setEditingDebtId(null)}>Cancelar</Button>
            <Button type="submit" disabled={updateDebtMutation.isPending}>
              {updateDebtMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </EditSheet>

      <EditSheet
        open={isCreating || !!editingId}
        onOpenChange={(open) => !open && handleCancel()}
        title={editingId ? 'Editar transação' : 'Nova transação'}
        description={editingId ? 'Atualize os detalhes da transação.' : 'Crie uma nova transação.'}
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
            Nova transação
          </Button>
        </div>
      )}
    </div>
  )
}
