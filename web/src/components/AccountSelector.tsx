import { useQuery } from '@tanstack/react-query'
import { fetchAccounts } from '@/lib/api'

interface AccountSelectorProps {
  selectedAccountId: string | null
  onSelectAccount: (accountId: string) => void
}

export function AccountSelector({ selectedAccountId, onSelectAccount }: AccountSelectorProps) {
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  if (accounts.length === 0) {
    return null
  }

  const defaultAccount = accounts.find(a => a.is_default)
  const displayId = selectedAccountId || defaultAccount?.id

  return (
    <select
      value={displayId || ''}
      onChange={e => onSelectAccount(e.target.value)}
      className="h-7 px-2 py-0.5 text-xs rounded-lg border border-input bg-background text-foreground cursor-pointer"
      title="Switch account"
    >
      {accounts.map(account => (
        <option key={account.id} value={account.id}>
          {account.name}
          {account.is_default ? ' (Default)' : ''}
        </option>
      ))}
    </select>
  )
}
