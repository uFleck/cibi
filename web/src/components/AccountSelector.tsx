import { useQuery } from '@tanstack/react-query'
import { fetchAccounts } from '@/lib/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AccountSelectorProps {
  selectedAccountId: string | null
  onSelectAccount: (accountId: string) => void
  fullWidth?: boolean
}

export function AccountSelector({ selectedAccountId, onSelectAccount, fullWidth }: AccountSelectorProps) {
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
    <Select value={displayId || ''} onValueChange={onSelectAccount}>
      <SelectTrigger
        size="sm"
        className={`h-7 text-xs${fullWidth ? ' w-full' : ''}`}
        title="Switch account"
      >
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map(account => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
            {account.is_default ? ' (Default)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
