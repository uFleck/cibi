import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAccounts,
  fetchTransactions,
  listPaySchedules,
  fetchFriendBreakdown,
  listFriends,
  fetchLedger,
} from '@/lib/api'
import {
  buildImpactSummary,
  computeProjectedBalanceAfterNextWindow,
  getWindowLabels,
} from '@/lib/transactions-impact'

export function useTransactionsData(selectedAccountId: string | null) {
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

  return {
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
  }
}
