import { useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import { AccountContext } from '@/shell/contexts'
import {
  fetchAccounts,
  fetchFriendBreakdown,
  fetchTransactions,
  listPaySchedules,
  type AccountResponse,
  type FriendDebtBreakdownItem,
  type PayScheduleResponse,
  type TransactionResponse,
} from '@/lib/api'

/** What the wall widgets read. Every field is loaded through the same React Query keys the old dashboard used. */
export interface WidgetData {
  account: AccountResponse
  accounts: AccountResponse[]
  transactions: TransactionResponse[]
  paySchedules: PayScheduleResponse[]
  friendBreakdown: FriendDebtBreakdownItem[]
  nextPayday: string | null
}

export interface Workspace {
  isLoading: boolean
  isError: boolean
  /** Null when there is no account yet. */
  data: WidgetData | null
}

export function useWorkspace(): Workspace {
  const { selectedAccountId } = useContext(AccountContext)

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const allAccounts = accounts.data ?? []
  const defaultAccount = allAccounts.find(a => a.is_default)
  const currentAccountId = selectedAccountId || defaultAccount?.id
  const account = allAccounts.find(a => a.id === currentAccountId) ?? defaultAccount ?? allAccounts[0]

  const transactions = useQuery({
    queryKey: ['transactions', account?.id],
    queryFn: () => fetchTransactions(account!.id),
    enabled: !!account?.id,
  })

  const paySchedules = useQuery({
    queryKey: ['pay-schedules', account?.id],
    queryFn: () => listPaySchedules(account!.id),
    enabled: !!account?.id,
  })

  const friendBreakdown = useQuery({
    queryKey: ['friend-breakdown', account?.id],
    queryFn: () => fetchFriendBreakdown(account!.id),
    enabled: !!account?.id,
  })

  const schedules = paySchedules.data ?? []
  const nextPayday = schedules.length > 0
    ? schedules.reduce((earliest, ps) => (ps.next_payday < earliest ? ps.next_payday : earliest), schedules[0].next_payday)
    : null

  const data: WidgetData | null = account
    ? {
        account,
        accounts: allAccounts,
        transactions: transactions.data ?? [],
        paySchedules: schedules,
        friendBreakdown: friendBreakdown.data ?? [],
        nextPayday,
      }
    : null

  return {
    isLoading: accounts.isLoading,
    isError: accounts.isError || transactions.isError,
    data,
  }
}
