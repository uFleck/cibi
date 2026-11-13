import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  ReceiptText,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { BillDialog } from '@/components/bills/BillDialog'
import { ConfirmAmountDialog } from '@/components/ConfirmAmountDialog'
import { Cat, PawPrint } from '@/components/cats/Cat'
import { EmptyCat } from '@/components/cats/EmptyCat'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyValue } from '@/components/ui/money-value'
import { ValueInput } from '@/components/ui/value-input'
import { usePlan } from '@/hooks/usePlan'
import {
  confirmInstallmentTransaction,
  confirmPaySchedule,
  confirmTransaction,
  createTransaction,
  settleDebt,
  unconfirmTransaction,
  updateAccount,
  type PayScheduleResponse,
  type TransactionResponse,
} from '@/lib/api'
import { formatDate, formatLocalDate, formatMoney } from '@/lib/format'
import {
  simulateSpend,
  type ForecastPeriod,
  type ForecastResult,
  type SpendSimulation,
} from '@/lib/forecast'
import { parseDecimalInput } from '@/lib/locale'
import { localDayOf, todayIso } from '@/lib/today'
import { cn } from '@/lib/utils'
import { celebrate } from '@/shell/secrets'

const PAGE = 'mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6'

function brl(cents: number, currency: string): string {
  return formatMoney(cents / 100, currency)
}

function dateLabel(value: string): string {
  return formatDate(`${value}T00:00:00Z`)
}

export function PlanPage() {
  const plan = usePlan()
  const [billDialog, setBillDialog] = useState<{ open: boolean; bill: TransactionResponse | null }>({ open: false, bill: null })
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [payTarget, setPayTarget] = useState<{ bill: TransactionResponse; amount: number } | null>(null)

  const currency = plan.account?.currency ?? 'BRL'
  const today = todayIso()

  const pay = useMutation({
    mutationFn: async ({ bill, amount }: { bill: TransactionResponse; amount: number }) => {
      if (bill.is_installment) {
        await confirmInstallmentTransaction(bill.id)
      } else {
        await confirmTransaction(bill.id, -Math.abs(amount))
      }
    },
    onSuccess: (_data, { bill }) => {
      // The last bill of the current period earns the big paw-print party.
      const left = (plan.forecast?.periods[0]?.items ?? []).filter(item => item.kind !== 'as-needed' && item.id !== bill.id)
      const inCurrent = (plan.forecast?.periods[0]?.items ?? []).some(item => item.id === bill.id)
      if (inCurrent && left.length === 0) {
        celebrate('all-paid')
        toast.success('Tudo pago neste período! Que orgulho 🐾')
      } else {
        celebrate('paw')
        toast.success('Pago! 🐾')
      }
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para registrar o pagamento'),
  })

  const undo = useMutation({
    mutationFn: (transactionId: string) => unconfirmTransaction(transactionId),
    onSuccess: () => {
      toast.success('Pronto, desfeito. Sem problemas!')
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para desfazer'),
  })

  const settle = useMutation({
    mutationFn: (debtId: string) => settleDebt(debtId),
    onSuccess: (_data, debtId) => {
      const debt = plan.debts.find(item => item.id === debtId)
      toast.success(debt?.is_installment ? 'Parcela paga' : 'Dívida paga')
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para pagar a dívida'),
  })

  const confirmPayday = useMutation({
    mutationFn: (schedule: PayScheduleResponse) => confirmPaySchedule(schedule.id),
    onSuccess: () => {
      celebrate('paw')
      toast.success('Dinheirinho na conta! 💸')
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para confirmar o recebimento'),
  })

  if (plan.isLoading) {
    return (
      <div className={PAGE}>
        <div className="h-24 animate-pulse rounded-2xl border border-line bg-surface/60" />
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/60" />
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/60" />
      </div>
    )
  }

  if (!plan.account) {
    return (
      <div className={PAGE}>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Cat mood="happy" size={80} />
            <div>
              <p className="font-semibold">Oi! Vamos começar pela sua conta?</p>
              <p className="text-sm text-muted-foreground">
                Informe o saldo de hoje e quando você recebe. O plano cuida do resto.
              </p>
            </div>
            <Button size="sm" asChild>
              <Link to="/ajustes"><Plus size={14} />Criar conta</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const forecast = plan.forecast
  if (!forecast) return null

  const duePaydays = plan.schedules.filter(schedule => schedule.next_payday <= today)
  const hasOverduePayday = duePaydays.some(schedule => schedule.next_payday < today)
  const hasPayday = plan.schedules.length > 0

  return (
    <div className={PAGE}>
      <BillDialog
        open={billDialog.open}
        onOpenChange={open => setBillDialog(prev => ({ ...prev, open }))}
        accountId={plan.account.id}
        bill={billDialog.bill}
        onSaved={plan.refresh}
      />

      <BalanceDialog
        key={plan.account.current_balance}
        open={balanceOpen}
        onOpenChange={setBalanceOpen}
        accountId={plan.account.id}
        current={plan.account.current_balance}
        currency={currency}
        onSaved={plan.refresh}
      />

      <ConfirmAmountDialog
        open={payTarget !== null}
        title={payTarget?.bill.title ?? ''}
        suggested={payTarget ? Math.abs(payTarget.amount) : 0}
        samples={0}
        sign={-1}
        hint="Mude se pagou outro valor. O pagamento pode ser desfeito no extrato."
        onCancel={() => setPayTarget(null)}
        onConfirm={amount => {
          const target = payTarget
          setPayTarget(null)
          if (target) pay.mutate({ bill: target.bill, amount: Math.abs(amount) })
        }}
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1 text-[11px] font-bold text-primary"><PawPrint size={12} />Plano</p>
          <h1 className="text-2xl font-extrabold tracking-tight">O que dá para gastar</h1>
          <p className="text-[12px] text-muted-foreground">
            Saldo, contas e o que sobra em cada recebimento. Tudo pode ser mudado depois.
          </p>
        </div>
        <Button size="sm" onClick={() => setBillDialog({ open: true, bill: null })}>
          <Plus size={14} />
          Nova despesa
        </Button>
      </header>

      {duePaydays.length > 0 ? (
        <Card className="border-[var(--color-verdict-yes)]/40 bg-[var(--color-verdict-yes-tint)]/40">
          <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Cat mood={hasOverduePayday ? 'sit' : 'party'} size={40} />
              <div>
                <p className="text-sm font-bold">{hasOverduePayday ? 'Tem um recebimento esperando você' : 'Hoje é dia de receber! 🎉'}</p>
                <p className="text-xs text-muted-foreground">
                  {duePaydays.map(schedule => `${schedule.label ?? 'Recebimento'}: ${formatMoney(schedule.amount, currency)}${schedule.next_payday < today ? ` (${dateLabel(schedule.next_payday)})` : ''}`).join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {duePaydays.map(schedule => (
                <Button key={schedule.id} size="sm" onClick={() => confirmPayday.mutate(schedule)} disabled={confirmPayday.isPending}>
                  <Check size={14} />
                  Recebi {formatMoney(schedule.amount, currency)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Summary
        currency={currency}
        forecast={forecast}
        balance={plan.account.current_balance}
        dueIncome={Math.round(duePaydays.reduce((sum, schedule) => sum + schedule.amount, 0) * 100)}
        onAdjustBalance={() => setBalanceOpen(true)}
      />

      {plan.forecastInput ? (
        <SpendSimulator input={plan.forecastInput} accountId={plan.account.id} currency={currency} onSaved={plan.refresh} />
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Recebimentos</h2>
            <p className="text-xs text-muted-foreground">Cada bloco vai de um recebimento até o próximo.</p>
          </div>
          {!hasPayday ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/ajustes">Configurar recebimento</Link>
            </Button>
          ) : null}
        </div>

        {!hasPayday ? (
          <Card>
            <CardContent>
              <EmptyCat mood="sit">
                Conta pra gente quando você recebe em <Link to="/ajustes" className="font-semibold text-primary underline">Ajustes</Link> e o plano se organiza sozinho.
              </EmptyCat>
            </CardContent>
          </Card>
        ) : (
          forecast.periods.map((period, index) => (
            <PeriodCard
              key={period.start}
              period={period}
              index={index}
              currency={currency}
              open={index === 0 || expanded.has(period.start)}
              onToggle={() => {
                setExpanded(prev => {
                  const next = new Set(prev)
                  if (next.has(period.start)) next.delete(period.start)
                  else next.add(period.start)
                  return next
                })
              }}
              paid={paidInPeriod(plan.ledger, plan.transactions, period)}
              bills={plan.transactions}
              onPay={bill => {
                if (bill.is_installment) pay.mutate({ bill, amount: Math.abs(bill.amount) })
                else setPayTarget({ bill, amount: Math.abs(bill.amount) })
              }}
              onPayDebt={debtId => settle.mutate(debtId)}
              onUndo={transactionId => undo.mutate(transactionId)}
              onEdit={bill => setBillDialog({ open: true, bill })}
            />
          ))
        )}
      </section>

      <BillsSection bills={plan.transactions} currency={currency} onEdit={bill => setBillDialog({ open: true, bill })} onNew={() => setBillDialog({ open: true, bill: null })} />
    </div>
  )
}

function Summary({
  currency,
  forecast,
  balance,
  dueIncome,
  onAdjustBalance,
}: {
  currency: string
  forecast: ForecastResult
  balance: number
  /** Cents of a payday that is due now and still unconfirmed. */
  dueIncome: number
  onAdjustBalance: () => void
}) {
  const freeTone = forecast.freeNow < 0 ? 'text-neg' : 'text-pos'
  const current = forecast.periods[0]
  const afterIncome = forecast.freeNow + dueIncome
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col gap-2 py-3">
          <span className="text-[11px] font-bold text-faint">Saldo hoje</span>
          <MoneyValue amount={balance} currency={currency} className="text-2xl font-semibold" />
          <Button size="xs" variant="outline" className="w-fit" onClick={onAdjustBalance}>
            <Pencil size={12} />
            Ajustar saldo
          </Button>
        </CardContent>
      </Card>

      <Card className="sm:col-span-2">
        <CardContent className="flex flex-col gap-2 py-3">
          <span className="text-[11px] font-bold text-faint">
            {current ? `Livre até ${dateLabel(current.end)}` : 'Livre para gastar'}
          </span>
          <span className={cn('num text-3xl font-semibold tracking-tight', freeTone)}>
            {brl(forecast.freeNow, currency)}
          </span>
          <p className="text-xs text-muted-foreground">
            {forecast.freeNow < 0
              ? dueIncome > 0
                ? afterIncome >= 0
                  ? `Faltam ${brl(-forecast.freeNow, currency)} para as contas. Com o recebimento de hoje (${brl(dueIncome, currency)}), sobram ${brl(afterIncome, currency)}.`
                  : `Faltam ${brl(-forecast.freeNow, currency)} para as contas. Com o recebimento de hoje (${brl(dueIncome, currency)}), ainda faltam ${brl(-afterIncome, currency)}.`
                : 'As contas deste período passam do saldo. Sem pânico: dá para ajustar uma conta ou o saldo.'
              : current
                ? current.income > 0
                  ? `Entra ${brl(current.income, currency)} · Contas ${brl(Math.abs(current.obligations), currency)} neste período.`
                  : `Saldo ${brl(current.opening, currency)} · Contas ${brl(Math.abs(current.obligations), currency)} neste período.`
                : 'Depois das contas do período.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function SpendSimulator({
  input,
  accountId,
  currency,
  onSaved,
}: {
  input: NonNullable<ReturnType<typeof usePlan>['forecastInput']>
  accountId: string
  currency: string
  onSaved: () => void
}) {
  const [amountText, setAmountText] = useState('')
  const [date, setDate] = useState(todayIso)
  const [title, setTitle] = useState('')
  const [result, setResult] = useState<SpendSimulation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const amount = parseDecimalInput(amountText)
  const amountCents = amount === null ? null : Math.round(Math.abs(amount) * 100)

  const save = useMutation({
    mutationFn: async () => {
      if (!amountCents) throw new Error('Informe o valor')
      const created = await createTransaction({
        account_id: accountId,
        amount: -amountCents / 100,
        title: title.trim() || 'Gasto',
        anchor_date: `${date}T00:00:00Z`,
        requires_confirmation: true,
      })
      // A purchase dated today (or in the past) is already paid; a future one stays planned.
      if (date <= todayIso()) await confirmTransaction(created.id, -amountCents / 100)
    },
    onSuccess: () => {
      toast.success(date <= todayIso() ? 'Gasto registrado' : 'Gasto planejado')
      setAmountText('')
      setTitle('')
      setResult(null)
      onSaved()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-3">
        <div className="flex items-center gap-2">
          <Cat mood="sit" size={32} alive={false} />
          <div>
            <h2 className="text-sm font-bold">Será que dá pra comprar?</h2>
            <p className="text-xs text-muted-foreground">
              Veja se uma compra cabe antes do próximo recebimento.
            </p>
          </div>
        </div>

        <form
          className="grid gap-2 sm:grid-cols-[1fr_150px_1fr_auto] sm:items-end"
          onSubmit={event => {
            event.preventDefault()
            setError(null)
            if (!amountCents) {
              setError('Informe o valor')
              return
            }
            setResult(simulateSpend(input, amountCents, date))
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-amount" className="text-xs">Valor</Label>
            <ValueInput id="sim-amount" value={amountText} onValueChange={setAmountText} allowNegative={false} placeholder="0,00" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-date" className="text-xs">Quando</Label>
            <DateInput id="sim-date" value={date} onChange={setDate} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-title" className="text-xs">Nome (opcional)</Label>
            <Input id="sim-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Mercado, sapato..." />
          </div>
          <Button type="submit" size="sm">Calcular</Button>
        </form>

        {error ? <p role="alert" className="text-xs text-neg">{error}</p> : null}

        {result ? (
          <div
            role="status"
            className={cn(
              'flex flex-col gap-2 rounded-2xl border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between',
              result.safe
                ? 'border-[var(--color-verdict-yes)]/40 bg-[var(--color-verdict-yes-tint)]/40'
                : 'border-[var(--color-verdict-no)]/40 bg-[var(--color-verdict-no-tint)]/40',
            )}
          >
            <div className="flex items-start gap-2">
              <Cat mood={result.safe ? 'happy' : 'oops'} size={36} alive={false} />
              <div>
                <p className="font-bold">{result.safe ? 'Cabe no plano! Pode ir 💖' : 'Hmm, agora não cabe'}</p>
                <p className="text-xs text-muted-foreground">
                  {result.safe
                    ? `O menor saldo depois da compra fica ${brl(result.minClosing, currency)}.`
                    : `Faltariam ${brl(Math.abs(result.minClosing), currency)} em ${result.breaksAt ? dateLabel(result.breaksAt) : 'algum período'}, antes do próximo recebimento.`}
                </p>
              </div>
            </div>
            <Button size="sm" variant={result.safe ? 'default' : 'outline'} onClick={() => save.mutate()} disabled={save.isPending}>
              {result.safe ? (date <= todayIso() ? 'Registrar gasto' : 'Planejar gasto') : 'Registrar mesmo assim'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

interface PaidRow {
  entryId: string
  transactionId: string
  title: string
  amount: number
  postedAt: string
}

function paidInPeriod(
  ledger: ReturnType<typeof usePlan>['ledger'],
  bills: TransactionResponse[],
  period: ForecastPeriod,
): PaidRow[] {
  const byId = new Map(bills.map(bill => [bill.id, bill]))
  const out: PaidRow[] = []
  for (const entry of ledger) {
    if (entry.entry_type !== 'payment' || entry.transaction_id === null) continue
    if (entry.reverses_entry_id || entry.reversed_by_id) continue
    const bill = byId.get(entry.transaction_id)
    if (!bill) continue
    const day = localDayOf(entry.posted_at)
    if (day < period.start || day >= period.end) continue
    out.push({
      entryId: entry.id,
      transactionId: entry.transaction_id,
      title: bill.title,
      amount: Math.round(entry.amount * 100),
      postedAt: entry.posted_at,
    })
  }
  return out
}

function PeriodCard({
  period,
  index,
  currency,
  open,
  onToggle,
  paid,
  bills,
  onPay,
  onPayDebt,
  onUndo,
  onEdit,
}: {
  period: ForecastPeriod
  index: number
  currency: string
  open: boolean
  onToggle: () => void
  paid: PaidRow[]
  bills: TransactionResponse[]
  onPay: (bill: TransactionResponse) => void
  onPayDebt: (debtId: string) => void
  onUndo: (transactionId: string) => void
  onEdit: (bill: TransactionResponse) => void
}) {
  const today = todayIso()
  const isCurrent = index === 0
  const freeTone = period.free < 0 ? 'text-neg' : 'text-pos'
  const byId = new Map(bills.map(bill => [bill.id, bill]))

  return (
    <Card className={cn(isCurrent && 'border-line-strong')}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              {dateLabel(period.start)} → {dateLabel(period.end)}
            </span>
            {isCurrent ? (
              <span className="rounded-full bg-blush px-2 py-0.5 text-[10px] font-bold text-primary">
                Agora 🐾
              </span>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            {period.income > 0
              ? `Entra ${brl(period.income, currency)} · Contas ${brl(Math.abs(period.obligations), currency)} · Saldo final ${brl(period.closing, currency)}`
              : `Saldo ${brl(period.opening, currency)} · Contas ${brl(Math.abs(period.obligations), currency)} · Saldo final ${brl(period.closing, currency)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-faint">Livre</span>
            <span className={cn('num text-lg font-semibold', freeTone)}>{brl(period.free, currency)}</span>
          </div>
          {open ? <ChevronDown size={16} className="text-faint" /> : <ChevronRight size={16} className="text-faint" />}
        </div>
      </button>

      {open ? (
        <div className="flex flex-col border-t border-line/70">
          {period.items.length === 0 && paid.length === 0 ? (
            <EmptyCat size={48} className="py-4">Nada para pagar aqui. Hora da soneca.</EmptyCat>
          ) : null}

          {period.items.map(item => {
            const bill = byId.get(item.id)
            const canPayAsNeeded = item.kind === 'as-needed' && period.start <= today && today < period.end
            const fixed = item.kind === 'bill' || item.kind === 'one-off' || item.kind === 'installment'
            return (
              <div key={`${item.id}-${item.date}-${item.kind}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/50 px-4 py-2.5 last:border-b-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium" title={item.title}>{item.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {dateLabel(item.date)}
                    {item.installmentNumber ? ` · parcela ${item.installmentNumber}/${item.installmentTotal ?? '?'}` : ''}
                    {item.kind === 'as-needed' ? ' · orçamento do mês' : ''}
                    {item.kind === 'debt' ? ' · dívida' : ''}
                  </span>
                </div>
                <MoneyValue amount={item.amount / 100} currency={currency} tone="negative" showSign="never" className="text-sm font-semibold" />
                <div className="flex flex-wrap gap-1.5">
                  {item.kind === 'debt' ? (
                    <Button size="sm" onClick={() => onPayDebt(item.id)}>Paguei</Button>
                  ) : null}
                  {fixed && bill ? (
                    <Button size="sm" onClick={() => onPay(bill)}>
                      {item.kind === 'installment' ? 'Pagar parcela' : 'Pagar'}
                    </Button>
                  ) : null}
                  {canPayAsNeeded && bill ? (
                    <Button size="sm" onClick={() => onPay(bill)}>Comprei</Button>
                  ) : null}
                  {bill ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${bill.title}`} onClick={() => onEdit(bill)}>
                      <Pencil size={13} />
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}

          {paid.length > 0 ? (
            <div className="flex flex-col bg-surface-2/40">
              <p className="px-4 pt-2 text-[11px] font-bold text-pos">Pagos ✓</p>
              {paid.map(row => (
                <div key={row.entryId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
                  <Check size={13} className="text-pos" />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{row.title} · {formatLocalDate(row.postedAt)}</span>
                  <MoneyValue amount={row.amount / 100} currency={currency} tone="negative" showSign="never" className="text-xs" />
                  <Button size="xs" variant="ghost" onClick={() => onUndo(row.transactionId)}>
                    <Undo2 size={12} />
                    Desfazer
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function BillsSection({
  bills,
  currency,
  onEdit,
  onNew,
}: {
  bills: TransactionResponse[]
  currency: string
  onEdit: (bill: TransactionResponse) => void
  onNew: () => void
}) {
  const sorted = useMemo(() => [...bills].sort((a, b) => a.title.localeCompare(b.title)), [bills])
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Todas as despesas</h2>
          <p className="text-xs text-muted-foreground">Edite o valor, a data ou o tipo. O plano se ajusta na hora.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus size={14} />
          Nova
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col py-1">
          {sorted.length === 0 ? (
            <EmptyCat>Nenhuma despesa ainda. Adicione a primeira quando quiser.</EmptyCat>
          ) : (
            sorted.map(bill => (
              <div key={bill.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 py-2 last:border-b-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{bill.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {bill.is_as_needed ? `Orçamento ${formatMoney(Math.abs(bill.month_budget ?? bill.amount), currency)}/mês` : null}
                    {bill.is_installment ? `Parcela ${bill.paid_installments + 1}/${bill.total_installments ?? '?'} · ${formatMoney(Math.abs(bill.amount), currency)}` : null}
                    {!bill.is_as_needed && !bill.is_installment ? `${bill.is_recurring ? 'Fixa' : 'Única'} · ${formatMoney(Math.abs(bill.amount), currency)}` : null}
                    {bill.next_occurrence ? ` · ${formatDate(bill.next_occurrence)}` : null}
                    {bill.confirmed_at ? ' · paga' : ''}
                  </span>
                </div>
                <Button size="xs" variant="ghost" onClick={() => onEdit(bill)}>
                  <Pencil size={12} />
                  Editar
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-[11px] text-faint">
        <ReceiptText size={12} />
        Pagamentos e estornos ficam no <Link to="/extrato" className="underline">extrato</Link>.
      </p>
    </section>
  )
}

function BalanceDialog({
  open,
  onOpenChange,
  accountId,
  current,
  currency,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  current: number
  currency: string
  onSaved: () => void
}) {
  const [text, setText] = useState(current.toFixed(2))
  const parsed = parseDecimalInput(text)
  const save = useMutation({
    mutationFn: () => updateAccount(accountId, { current_balance: parsed ?? current }),
    onSuccess: () => {
      toast.success('Saldo ajustado')
      onOpenChange(false)
      onSaved()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para ajustar o saldo'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar saldo</DialogTitle>
          <DialogDescription>
            Coloque o saldo que aparece no banco. A diferença fica registrada como ajuste no extrato.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={event => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="balance-now" className="text-xs">Saldo hoje ({currency})</Label>
            <ValueInput id="balance-now" value={text} onValueChange={setText} allowNegative placeholder="0,00" autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={save.isPending || parsed === null}>
              {save.isPending ? 'Salvando...' : 'Ajustar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
