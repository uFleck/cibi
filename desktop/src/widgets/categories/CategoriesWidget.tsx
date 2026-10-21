import { useQuery } from '@tanstack/react-query'
import { MoneyValue } from '@/components/ui/money-value'
import { fetchLedger, type AccountResponse, type TransactionResponse } from '@/lib/api'
import { spendByCategory } from './spend'

interface CategoriesWidgetProps {
  account: AccountResponse
  transactions: TransactionResponse[]
}

export function CategoriesWidget({ account, transactions }: CategoriesWidgetProps) {
  const { data: entries, isLoading, isError } = useQuery({
    queryKey: ['ledger', account.id],
    queryFn: () => fetchLedger(account.id),
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando gastos...</p>
  if (isError) return <p className="text-sm text-muted-foreground">Não deu para carregar os gastos.</p>

  const { rows, total } = spendByCategory(entries ?? [], transactions, new Date())
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum gasto registrado neste mês.</p>
  }
  const largest = rows[0].amount

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Gasto neste mês</span>
        <MoneyValue amount={total} currency={account.currency} tone="neutral" showSign="never" className="font-mono text-foreground" />
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map(row => (
          <li key={row.category} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{row.category}</span>
              <MoneyValue amount={row.amount} currency={account.currency} tone="neutral" showSign="never" className="shrink-0 font-mono" />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-hl" style={{ width: `${(row.amount / largest) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
