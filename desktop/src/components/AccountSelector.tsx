import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
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
  compact?: boolean
}

export function AccountSelector({ selectedAccountId, onSelectAccount, fullWidth, compact = false }: AccountSelectorProps) {
  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  if (isLoading || isError) {
    return null
  }

  if (accounts.length === 0) {
    return (
      <Button asChild variant="outline" className={`${compact ? 'h-8 text-xs' : 'h-10 text-sm'}${fullWidth ? ' w-full' : ''}`}>
        <Link to="/accounts">Create account</Link>
      </Button>
    )
  }

  const displayId = selectedAccountId || accounts[0]?.id

  return (
    <Select value={displayId || ''} onValueChange={onSelectAccount}>
      <SelectTrigger
        size="sm"
        className={`${compact ? 'h-8 text-xs' : 'h-10 text-sm'}${fullWidth ? ' w-full' : ''}`}
        title="Switch account"
      >
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map(account => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
