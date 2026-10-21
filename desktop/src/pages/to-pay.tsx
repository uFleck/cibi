// The home page: what has to be paid before the next payday, what is left of the as-needed budgets,
// and the bills nobody is sure about. Every bill has its buttons in plain sight.

import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, CircleHelp, Plus, SkipForward, Undo2 } from 'lucide-react'
import { useBillActions, type BillActions } from '@/components/bills/useBillActions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { PageHeader, pageShell } from '@/components/ui/page-header'
import { effectiveAmount, type TransactionResponse } from '@/lib/api'
import { asNeededBudget, asNeededLeft, asNeededSpent, isScheduledBill } from '@/lib/bills'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { formatDate, formatMoney } from '@/lib/format'
import { countInCurrentPayWindow } from '@/lib/occurrences'
import { cn } from '@/lib/utils'
import { KpisBody } from '@/widgets/bodies'
import { useWorkspace } from '@/widgets/useWorkspace'

interface DueBill {
  t: TransactionResponse
  date: string
  /** How many times it is due before the payday (a weekly bill can be due twice). */
  times: number
}

function dueDate(t: TransactionResponse): string | null {
  if (t.is_recurring || t.is_installment) return t.next_occurrence
  return t.anchor_date || t.timestamp
}

/** The bills due before the next payday: recurring ones by date, unpaid installments and pending one-offs. */
function dueBills(transactions: TransactionResponse[], nextPayday: string | null, now: Date): DueBill[] {
  const due: DueBill[] = []
  for (const t of transactions) {
    if (t.amount >= 0) continue
    const date = dueDate(t)
    if (date === null || !isInCurrentPayWindow(date, now, nextPayday)) continue
    if (isScheduledBill(t) && !t.is_installment) {
      due.push({ t, date, times: countInCurrentPayWindow(t, nextPayday) })
    } else if (t.is_installment && (t.paid_installments ?? 0) < (t.total_installments ?? 0)) {
      due.push({ t, date, times: 1 })
    } else if (!t.is_recurring && !t.is_installment && t.requires_confirmation && !t.confirmed_at) {
      due.push({ t, date, times: 1 })
    }
  }
  return due.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function isOverdue(date: string, now: Date): boolean {
  const d = new Date(date)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) < today
}

export function ToPayPage() {
  const { data, isLoading } = useWorkspace()
  const actions = useBillActions(data?.account.currency ?? 'BRL')

  if (!data) {
    return (
      <div className={pageShell}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">Carregando...</p>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="mb-4 text-muted-foreground">Crie uma conta para começar</p>
              <Button size="sm" asChild>
                <Link to="/accounts"><Plus size={16} />Criar conta</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  const now = new Date()
  const currency = data.account.currency
  const expenses = data.transactions.filter(t => t.amount < 0)
  const due = dueBills(expenses, data.nextPayday, now)
  const asNeeded = expenses.filter(t => t.is_as_needed && !t.is_uncertain)
  const uncertain = expenses.filter(t => t.is_recurring && t.is_uncertain)
  const dueTotal = due.reduce((sum, b) => sum + Math.abs(effectiveAmount(b.t)) * b.times, 0)
  const uncertainTotal = uncertain.reduce(
    (sum, t) => sum + (t.is_as_needed ? asNeededBudget(t) : Math.abs(effectiveAmount(t))),
    0,
  )
  const payday = data.nextPayday ? formatDate(`${data.nextPayday}T00:00:00Z`) : null

  return (
    <div className={pageShell}>
      {actions.dialog}
      <PageHeader
        eyebrow="Início"
        title="A pagar"
        description={payday ? `O que precisa ser pago até o próximo recebimento (${payday}).` : 'O que precisa ser pago.'}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/transactions">Ver todas as contas</Link>
          </Button>
        }
      />

      <div className="@container">
        <KpisBody data={data} />
      </div>

      {uncertain.length > 0 && (
        <Section
          title="Não sei se vamos pagar"
          note={`${uncertain.length} ${uncertain.length === 1 ? 'conta' : 'contas'} (${formatMoney(uncertainTotal, currency)}) fora da conta até vocês decidirem.`}
          tone="warning"
        >
          {uncertain.map(t => (
            <BillRow
              key={t.id}
              title={t.title}
              detail={t.is_as_needed ? 'Quando precisar' : t.next_occurrence ? formatDate(t.next_occurrence) : null}
              amount={t.is_as_needed ? -asNeededBudget(t) : effectiveAmount(t)}
              currency={currency}
            >
              <PayButton t={t} actions={actions} />
              <Button size="sm" variant="outline" onClick={() => actions.toggleUncertain(t)}>
                <Undo2 size={14} />Vamos pagar
              </Button>
            </BillRow>
          ))}
        </Section>
      )}

      <Section
        title={payday ? `Até ${payday}` : 'Contas'}
        note={due.length > 0 ? `Total: ${formatMoney(dueTotal, currency)}` : undefined}
      >
        {due.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Nada para pagar antes do próximo recebimento.</p>
        ) : (
          due.map(({ t, date, times }) => {
            const late = isOverdue(date, now)
            return (
              <BillRow
                key={t.id}
                title={t.title}
                detail={
                  <span className={cn(late && 'text-[var(--color-verdict-no)] font-medium')}>
                    {late ? `Atrasada · ${formatDate(date)}` : formatDate(date)}
                    {times > 1 ? ` · ${times}×` : ''}
                    {t.is_installment ? ` · parcela ${(t.paid_installments ?? 0) + 1}/${t.total_installments ?? '?'}` : ''}
                  </span>
                }
                amount={effectiveAmount(t)}
                currency={currency}
              >
                <PayButton t={t} actions={actions} />
                {(t.is_recurring || t.is_installment) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => actions.skip(t)}
                    title={t.is_recurring ? 'Não paga este mês: vai para a próxima data' : 'Não paga esta parcela agora: vai para a próxima data'}
                  >
                    <SkipForward size={14} />Pular
                  </Button>
                )}
                {t.is_recurring && (
                  <Button size="sm" variant="ghost" onClick={() => actions.toggleUncertain(t)} title="Tira da conta até vocês decidirem">
                    <CircleHelp size={14} />Não sei
                  </Button>
                )}
              </BillRow>
            )
          })
        )}
      </Section>

      {asNeeded.length > 0 && (
        <Section title="Quando precisar" note="O orçamento de cada mês; cada compra desconta dele.">
          {asNeeded.map(t => (
            <AsNeededRow key={t.id} t={t} currency={currency} actions={actions} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, note, tone, children }: { title: string; note?: string; tone?: 'warning'; children: ReactNode }) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border/60 bg-card px-4 py-3',
        tone === 'warning' && 'border-[var(--color-risk-medium)]/50 bg-[var(--color-risk-medium)]/5',
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 pb-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </header>
      <div className="flex flex-col divide-y divide-border/50">{children}</div>
    </section>
  )
}

function BillRow({
  title,
  detail,
  amount,
  currency,
  children,
}: {
  title: string
  detail: ReactNode
  amount: number
  currency: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium" title={title}>{title}</span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </div>
      <MoneyValue amount={amount} currency={currency} tone="negative" showSign="never" className="text-sm font-semibold tabular-nums" />
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function PayButton({ t, actions }: { t: TransactionResponse; actions: BillActions }) {
  return (
    <Button size="sm" onClick={() => actions.pay(t)}>
      <Check size={14} />Pago
    </Button>
  )
}

function AsNeededRow({ t, currency, actions }: { t: TransactionResponse; currency: string; actions: BillActions }) {
  const budget = asNeededBudget(t)
  const spent = asNeededSpent(t)
  const left = asNeededLeft(t)
  const ratio = budget > 0 ? Math.min(1, spent / budget) : 1
  return (
    <div className="flex flex-col gap-2 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium" title={t.title}>{t.title}</span>
          <span className="text-xs text-muted-foreground">
            Gastaram {formatMoney(spent, currency)} de {formatMoney(budget, currency)} este mês
          </span>
        </div>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            left < 0 ? 'text-[var(--color-verdict-no)]' : 'text-foreground',
          )}
        >
          {left < 0 ? `acima em ${formatMoney(-left, currency)}` : `faltam ${formatMoney(left, currency)}`}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => actions.pay(t)}>
            <Plus size={14} />Comprei
          </Button>
          <Button size="sm" variant="ghost" onClick={() => actions.toggleUncertain(t)} title="Tira da conta até vocês decidirem">
            <CircleHelp size={14} />Não sei
          </Button>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn('h-full rounded-full', left < 0 ? 'bg-[var(--color-verdict-no)]' : 'bg-primary')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}
