import { useQuery } from '@tanstack/react-query'
import { fetchReserve, type AccountResponse } from '@/lib/api'

export const reserveKey = (accountId: string) => ['reserve', accountId] as const

export function useReserve(accountId: string) {
  return useQuery({
    queryKey: reserveKey(accountId),
    queryFn: () => fetchReserve(accountId),
    enabled: accountId !== '',
  })
}

/**
 * What the account must keep, in dollars: the reserve balance while the reserve is on, else the
 * account's own safety buffer. The "Can I Buy It?" check applies the same rule on its side.
 */
export function useBufferDollars(account: Pick<AccountResponse, 'id' | 'safety_buffer'>): number {
  const { data } = useReserve(account.id)
  return data?.enabled ? data.balance : (account.safety_buffer ?? 0)
}
