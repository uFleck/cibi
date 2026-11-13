import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { BillKindFilter } from '@/components/BillKindFilter'
import { useBillKindFilter } from '@/hooks/useBillKindFilter'
import { PawPrint } from '@/components/cats/Cat'
import { EmptyCat } from '@/components/cats/EmptyCat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { usePlan } from '@/hooks/usePlan'
import {
  reverseLedgerEntry,
  unconfirmPaySchedule,
  unconfirmTransaction,
  type LedgerEntryResponse,
} from '@/lib/api'
import { countKinds, entryKind, kindVisible } from '@/lib/bill-kinds'
import { formatDate, formatLocalDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAGE = 'mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6'

type Filter = 'all' | 'in' | 'out'

export function StatementPage() {
  const plan = usePlan()
  const [filter, setFilter] = useState<Filter>('all')
  const kinds = useBillKindFilter('cibi.filter.statement')
  const currency = plan.account?.currency ?? 'BRL'

  const bills = useMemo(() => new Map(plan.transactions.map(bill => [bill.id, bill])), [plan.transactions])
  const debts = useMemo(() => new Map(plan.debts.map(debt => [debt.id, debt])), [plan.debts])
  const schedules = useMemo(() => new Map(plan.schedules.map(schedule => [schedule.id, schedule])), [plan.schedules])

  const undo = useMutation({
    mutationFn: async (entry: LedgerEntryResponse) => {
      if (entry.pay_schedule_id) {
        await unconfirmPaySchedule(entry.pay_schedule_id)
        return
      }
      if (entry.transaction_id && (bills.has(entry.transaction_id) || debts.has(entry.transaction_id))) {
        await unconfirmTransaction(entry.transaction_id)
        return
      }
      await reverseLedgerEntry(entry.id)
    },
    onSuccess: () => {
      toast.success('Lançamento desfeito; o original fica no extrato')
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para desfazer'),
  })

  const kindById = useMemo(() => {
    const entries = new Map(plan.ledger.map(entry => [entry.id, entry]))
    return new Map(plan.ledger.map(entry => [entry.id, entryKind(entry, bills, entries)]))
  }, [plan.ledger, bills])

  const byDirection = plan.ledger.filter(entry => {
    if (filter === 'in') return entry.amount > 0
    if (filter === 'out') return entry.amount < 0
    return true
  })
  const counts = countKinds(byDirection.map(entry => kindById.get(entry.id) ?? null))
  const rows = byDirection.filter(entry => kindVisible(kindById.get(entry.id) ?? null, kinds.selected))
  const hiddenCount = byDirection.length - rows.length

  return (
    <div className={PAGE}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1 text-[11px] font-bold text-primary"><PawPrint size={12} />Extrato</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Tudo o que entrou e saiu</h1>
          <p className="text-[12px] text-muted-foreground">
            Cada pagamento pode ser desfeito. O lançamento original fica aqui, com o estorno ao lado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-7 px-2.5">
            Saldo {plan.account ? plan.account.current_balance.toLocaleString('pt-BR', { style: 'currency', currency }) : '-'}
          </Badge>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { value: 'all', label: 'Tudo' },
          { value: 'in', label: 'Entradas' },
          { value: 'out', label: 'Saídas' },
        ] as const).map(item => (
          <Button
            key={item.value}
            size="xs"
            variant={filter === item.value ? 'default' : 'outline'}
            onClick={() => setFilter(item.value)}
            aria-pressed={filter === item.value}
          >
            {item.label}
          </Button>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-line" />
        <BillKindFilter selected={kinds.selected} counts={counts} onToggle={kinds.toggle} />
        <span className="ml-auto text-[11px] text-faint">
          {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}
          {hiddenCount > 0 ? ` · ${hiddenCount} escondido${hiddenCount === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      <Card>
        <CardContent className="flex flex-col py-1">
          {plan.isLoading ? (
            <EmptyCat mood="sit" className="py-8">Buscando seus lançamentos...</EmptyCat>
          ) : rows.length === 0 && hiddenCount > 0 ? (
            <EmptyCat mood="sit" className="py-10">Nada com esses filtros. Ligue um tipo acima para ver mais.</EmptyCat>
          ) : rows.length === 0 ? (
            <EmptyCat className="py-10">
              Nada aqui ainda. Pague uma conta no <Link to="/" className="font-semibold text-primary underline">plano</Link> e o extrato começa.
            </EmptyCat>
          ) : (
            rows.map(entry => {
              const label = entryLabel(entry, bills, debts, schedules)
              const reversed = entry.reversed_by_id !== null && entry.reversed_by_id !== undefined
              const isReversal = entry.reverses_entry_id !== null && entry.reverses_entry_id !== undefined
              const canUndo = !reversed && !isReversal
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 py-2 last:border-b-0',
                    reversed && 'opacity-50',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full',
                      entry.amount >= 0 ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg',
                    )}
                  >
                    {entry.amount >= 0 ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={cn('truncate text-sm font-medium', reversed && 'line-through')}>
                      {label}
                      {isReversal ? <span className="ml-1.5 text-[10px] font-normal text-faint">estorno</span> : null}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatLocalDate(entry.posted_at)}
                      {entry.occurrence_date ? ` · vencia ${formatDate(entry.occurrence_date)}` : ''}
                      {reversed ? ' · desfeito' : ''}
                    </span>
                  </div>
                  <MoneyValue
                    amount={entry.amount}
                    currency={currency}
                    tone={entry.amount >= 0 ? 'positive' : 'negative'}
                    showSign="always"
                    className="text-sm font-semibold"
                  />
                  {canUndo ? (
                    <Button size="xs" variant="ghost" onClick={() => undo.mutate(entry)} disabled={undo.isPending}>
                      <RotateCcw size={12} />
                      Desfazer
                    </Button>
                  ) : (
                    <span className="w-[70px] text-right text-[10px] text-faint">{reversed ? 'desfeito' : ''}</span>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function entryLabel(
  entry: LedgerEntryResponse,
  bills: Map<string, { title: string }>,
  debts: Map<string, { title: string }>,
  schedules: Map<string, { label: string | null; amount: number }>,
): string {
  if (entry.pay_schedule_id) {
    return schedules.get(entry.pay_schedule_id)?.label ?? 'Recebimento'
  }
  if (entry.transaction_id) {
    return bills.get(entry.transaction_id)?.title
      ?? debts.get(entry.transaction_id)?.title
      ?? entry.description
  }
  return entry.description || 'Ajuste'
}
