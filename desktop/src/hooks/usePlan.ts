import { useContext, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AccountContext } from '@/shell/contexts'
import {
  fetchAccounts,
  fetchLedger,
  fetchTransactions,
  listFriends,
  listPaySchedules,
  listPeerDebts,
  type AccountResponse,
  type LedgerEntryResponse,
  type FriendResponse,
  type PeerDebtResponse,
  type PayScheduleResponse,
  type TransactionResponse,
} from '@/lib/api'
import { nextInstallmentDue } from '@/domain/engine/installment'
import { todayIso } from '@/lib/today'
import {
  buildForecast,
  parseDateValue,
  type ForecastBill,
  type ForecastDebt,
  type ForecastInput,
  type ForecastResult,
  type ForecastSchedule,
} from '@/lib/forecast'

export interface PlanData {
  account: AccountResponse | null
  accounts: AccountResponse[]
  transactions: TransactionResponse[]
  schedules: PayScheduleResponse[]
  debts: PeerDebtResponse[]
  friends: FriendResponse[]
  ledger: LedgerEntryResponse[]
  forecast: ForecastResult | null
  forecastInput: ForecastInput | null
  isLoading: boolean
  isError: boolean
  refresh: () => void
}

const cents = (dollars: number): number => Math.round(dollars * 100)
const NO_ACCOUNTS: AccountResponse[] = []
const NO_TRANSACTIONS: TransactionResponse[] = []
const NO_SCHEDULES: PayScheduleResponse[] = []
const NO_DEBTS: PeerDebtResponse[] = []
const NO_FRIENDS: FriendResponse[] = []
const NO_LEDGER: LedgerEntryResponse[] = []

function toSchedule(ps: PayScheduleResponse, today: string): ForecastSchedule {
  return {
    id: ps.id,
    frequency: ps.frequency,
    anchorDate: ps.anchor_date,
    amount: cents(ps.amount),
    dayOfMonth2: ps.day_of_month_2,
    includeIncome: ps.next_payday > today,
  }
}

function toBill(t: TransactionResponse): ForecastBill {
  return {
    id: t.id,
    title: t.title,
    amount: cents(t.amount),
    isRecurring: t.is_recurring,
    frequency: t.frequency,
    nextOccurrence: t.next_occurrence,
    isInstallment: t.is_installment,
    totalInstallments: t.total_installments,
    paidInstallments: t.paid_installments,
    isAsNeeded: t.is_as_needed ?? false,
    monthBudget: t.month_budget == null ? null : cents(t.month_budget),
    monthSpent: t.month_spent == null ? null : cents(t.month_spent),
    requiresConfirmation: t.requires_confirmation,
    confirmedAt: t.confirmed_at,
    anchorDate: t.anchor_date,
    timestamp: t.timestamp,
  }
}

/** The active debts the user still has to pay, with the actual id so the row can settle it. */
function toDebtObligations(debts: PeerDebtResponse[]): ForecastDebt[] {
  const out: ForecastDebt[] = []
  for (const debt of debts) {
    if (debt.amount >= 0) continue // the friend owes the user: not an obligation
    if (debt.is_installment) {
      const total = debt.total_installments ?? 0
      if (total <= 0 || debt.paid_installments >= total) continue
      const first = parseDateValue(debt.anchor_date ?? debt.date)
      const due = first === null
        ? null
        : nextInstallmentDue(first, debt.paid_installments, debt.frequency ?? 'monthly')
      const per = Math.trunc(Math.abs(debt.amount) / total)
      out.push({
        id: debt.id,
        name: debt.title,
        amount: cents(per),
        date: due === null ? null : due.toISOString().slice(0, 10),
      })
      continue
    }
    if (debt.is_confirmed) continue
    out.push({
      id: debt.id,
      name: debt.title,
      amount: cents(Math.abs(debt.amount)),
      date: debt.date,
    })
  }
  return out
}

export function usePlan(): PlanData {
  const { selectedAccountId } = useContext(AccountContext)
  const queryClient = useQueryClient()

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const accounts = accountsQuery.data ?? NO_ACCOUNTS
  const account = accounts.find(a => a.id === selectedAccountId) ?? accounts[0] ?? null

  const transactionsQuery = useQuery({
    queryKey: ['transactions', account?.id],
    queryFn: () => fetchTransactions(account!.id),
    enabled: !!account?.id,
  })
  const schedulesQuery = useQuery({
    queryKey: ['pay-schedules', account?.id],
    queryFn: () => listPaySchedules(account!.id),
    enabled: !!account?.id,
  })
  const ledgerQuery = useQuery({
    queryKey: ['ledger', account?.id],
    queryFn: () => fetchLedger(account!.id),
    enabled: !!account?.id,
  })
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: listFriends })
  const debtsQuery = useQuery({
    queryKey: ['peer-debts', account?.id],
    queryFn: () => listPeerDebts(account!.id),
    enabled: !!account?.id,
  })

  const transactions = useMemo(
    () => (transactionsQuery.data ?? NO_TRANSACTIONS).filter(t => t.type === 'personal' && t.amount < 0),
    [transactionsQuery.data],
  )
  const schedules = schedulesQuery.data ?? NO_SCHEDULES
  const debts = debtsQuery.data ?? NO_DEBTS
  const friends = friendsQuery.data ?? NO_FRIENDS
  const ledger = ledgerQuery.data ?? NO_LEDGER

  const forecastInput = useMemo<ForecastInput | null>(() => {
    if (!account) return null
    const today = todayIso()
    return {
      now: new Date(),
      today,
      balance: cents(account.current_balance),
      floor: 0,
      schedules: schedules.map(schedule => toSchedule(schedule, today)),
      bills: transactions.map(toBill),
      debts: toDebtObligations(debts),
      periodCount: 6,
    }
  }, [account, schedules, transactions, debts])

  const forecast = useMemo(() => (forecastInput ? buildForecast(forecastInput) : null), [forecastInput])

  const refresh = () => {
    for (const key of ['accounts', 'transactions', 'pay-schedules', 'ledger', 'friends', 'peer-debts']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }

  return {
    account,
    accounts,
    transactions,
    schedules,
    debts,
    friends,
    ledger,
    forecast,
    forecastInput,
    isLoading: accountsQuery.isLoading || (!!account && (transactionsQuery.isLoading || schedulesQuery.isLoading || ledgerQuery.isLoading)),
    isError: accountsQuery.isError || transactionsQuery.isError,
    refresh,
  }
}
