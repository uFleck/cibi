import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { MoneyValue } from '@/components/ui/money-value'
import type { AccountResponse } from '@/lib/api'

interface AccountsWidgetProps {
  accounts: AccountResponse[]
}

export function AccountsWidget({ accounts }: AccountsWidgetProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Nenhuma conta ainda.</p>
        <Button size="sm" asChild>
          <Link to="/accounts">Criar conta</Link>
        </Button>
      </div>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {accounts.map(account => (
        <li key={account.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm">{account.name}</span>
          </span>
          <MoneyValue amount={account.current_balance} currency={account.currency} tone="neutral" className="shrink-0 font-mono" />
        </li>
      ))}
    </ul>
  )
}
