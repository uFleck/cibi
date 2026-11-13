import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Check, ChevronRight, HandCoins, History, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppModal } from '@/components/AppModal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyValue } from '@/components/ui/money-value'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ValueInput } from '@/components/ui/value-input'
import { usePlan } from '@/hooks/usePlan'
import {
  createFriend,
  createPeerDebt,
  deletePeerDebt,
  settleDebt,
  unsettleDebt,
  updatePeerDebt,
  type PeerDebtResponse,
} from '@/lib/api'
import {
  DEBT_FREQUENCIES,
  debtHistory,
  datePart,
  dueFromAnchor,
  summarizeDebt,
  type DebtHistoryRow,
  type DebtInstallment,
  type DebtSummary,
} from '@/lib/debtSchedule'
import { formatDate, formatLocalDate, formatMoney } from '@/lib/format'
import { parseDecimalInput } from '@/lib/locale'
import { todayIso } from '@/lib/today'
import { cn } from '@/lib/utils'

const PAGE = 'mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6'

function friendName(debt: PeerDebtResponse, friends: { id: string; name: string }[]): string {
  return friends.find(friend => friend.id === debt.friend_id)?.name ?? 'amigo'
}

function debtLabel(debt: PeerDebtResponse, friends: { id: string; name: string }[]): string {
  return debt.amount < 0
    ? `Você deve para ${friendName(debt, friends)}`
    : `${friendName(debt, friends)} deve para você`
}

export function DebtsPage() {
  const plan = usePlan()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PeerDebtResponse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PeerDebtResponse | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const currency = plan.account?.currency ?? 'BRL'

  const summaries = useMemo(() => {
    const map = new Map<string, DebtSummary>()
    for (const debt of plan.debts) map.set(debt.id, summarizeDebt(debt, plan.ledger))
    return map
  }, [plan.debts, plan.ledger])

  const settle = useMutation({
    mutationFn: (id: string) => settleDebt(id),
    onSuccess: () => {
      toast.success('Pagamento registrado')
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para registrar'),
  })

  const unsettle = useMutation({
    mutationFn: (id: string) => unsettleDebt(id),
    onSuccess: () => {
      toast.success('Pagamento desfeito')
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para desfazer'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deletePeerDebt(id),
    onSuccess: () => {
      toast.success('Dívida excluída')
      setDeleteTarget(null)
      plan.refresh()
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para excluir'),
  })

  const toggleExpanded = (id: string) => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const active = plan.debts.filter(debt => summaries.get(debt.id)?.isActive)
  const settled = plan.debts.filter(debt => !summaries.get(debt.id)?.isActive)

  const sortedActive = useMemo(
    () =>
      [...active].sort((a, b) => {
        const dateA = summaries.get(a.id)?.next?.dueDate ?? '9999-12-31'
        const dateB = summaries.get(b.id)?.next?.dueDate ?? '9999-12-31'
        if (dateA !== dateB) return dateA.localeCompare(dateB)
        return friendName(a, plan.friends).localeCompare(friendName(b, plan.friends))
      }),
    [active, summaries, plan.friends],
  )

  const owe = active
    .filter(debt => debt.amount < 0)
    .reduce((sum, debt) => sum + (summaries.get(debt.id)?.remaining ?? 0), 0)
  const owed = active
    .filter(debt => debt.amount > 0)
    .reduce((sum, debt) => sum + (summaries.get(debt.id)?.remaining ?? 0), 0)

  if (!plan.account) {
    return (
      <div className={PAGE}>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Crie uma conta em Ajustes antes de registrar dívidas.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={PAGE}>
      <DebtDialog
        open={creating}
        onOpenChange={setCreating}
        accountId={plan.account.id}
        friends={plan.friends}
        onSaved={plan.refresh}
      />

      <DebtEditDialog
        debt={editing}
        friends={plan.friends}
        currency={currency}
        onOpenChange={open => { if (!open) setEditing(null) }}
        onSaved={plan.refresh}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id)
        }}
        title="Excluir esta dívida?"
        description="Os pagamentos já feitos continuam no extrato. A dívida sai do plano."
        confirmLabel="Excluir"
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint">Amigos</p>
          <h1 className="text-xl font-semibold tracking-tight">Quem deve quem</h1>
          <p className="text-[12px] text-muted-foreground">
            O que você deve entra no plano. Abra uma dívida para ver as parcelas, o histórico e mudar o próximo vencimento.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} />
          Nova dívida
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 py-3">
            <span className="text-[11px] font-medium uppercase tracking-widest text-faint">Você deve</span>
            <MoneyValue amount={-owe / 100} currency={currency} tone="negative" showSign="never" className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 py-3">
            <span className="text-[11px] font-medium uppercase tracking-widest text-faint">Devem a você</span>
            <MoneyValue amount={owed / 100} currency={currency} tone="positive" showSign="never" className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 py-3">
            <span className="text-[11px] font-medium uppercase tracking-widest text-faint">Saldo</span>
            <span className={cn('num text-2xl font-semibold', owed - owe >= 0 ? 'text-pos' : 'text-neg')}>
              {formatMoney((owed - owe) / 100, currency)}
            </span>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Em aberto</h2>
        <Card>
          <CardContent className="flex flex-col py-1">
            {sortedActive.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <HandCoins size={24} className="text-faint" />
                <p className="text-sm text-muted-foreground">Nenhuma dívida em aberto.</p>
              </div>
            ) : (
              sortedActive.map(debt => (
                <DebtRow
                  key={debt.id}
                  debt={debt}
                  summary={summaries.get(debt.id)!}
                  friends={plan.friends}
                  ledger={plan.ledger}
                  currency={currency}
                  expanded={expanded.has(debt.id)}
                  onToggle={() => toggleExpanded(debt.id)}
                  onPay={() => settle.mutate(debt.id)}
                  onUndo={() => unsettle.mutate(debt.id)}
                  onEdit={() => setEditing(debt)}
                  onDelete={() => setDeleteTarget(debt)}
                  paying={settle.isPending}
                  undoing={unsettle.isPending}
                />
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {settled.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Pagas</h2>
          <Card>
            <CardContent className="flex flex-col py-1">
              {settled.map(debt => {
                const summary = summaries.get(debt.id)!
                return (
                  <div key={debt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 py-2 opacity-60 last:border-b-0">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {debtLabel(debt, plan.friends)} · {debt.title}
                    </span>
                    <MoneyValue amount={summary.total / 100} currency={currency} tone="neutral" showSign="never" className="text-xs" />
                    {summary.paidCount > 0 ? (
                      <Button size="xs" variant="ghost" onClick={() => unsettle.mutate(debt.id)} disabled={unsettle.isPending}>
                        <Undo2 size={12} />
                        Desfazer
                      </Button>
                    ) : null}
                    <Button size="icon-sm" variant="ghost" aria-label="Excluir" onClick={() => setDeleteTarget(debt)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

function DebtRow({
  debt,
  summary,
  friends,
  ledger,
  currency,
  expanded,
  onToggle,
  onPay,
  onUndo,
  onEdit,
  onDelete,
  paying,
  undoing,
}: {
  debt: PeerDebtResponse
  summary: DebtSummary
  friends: { id: string; name: string }[]
  ledger: ReturnType<typeof usePlan>['ledger']
  currency: string
  expanded: boolean
  onToggle: () => void
  onPay: () => void
  onUndo: () => void
  onEdit: () => void
  onDelete: () => void
  paying: boolean
  undoing: boolean
}) {
  const youOwe = debt.amount < 0
  const next = summary.next
  const canUndo = debt.is_installment ? summary.paidCount > 0 : debt.is_confirmed
  const detail = [
    debt.title,
    debt.is_installment ? `parcela ${Math.min(debt.paid_installments + 1, summary.totalCount)}/${summary.totalCount}` : null,
    next?.dueDate ? formatDate(`${next.dueDate}T00:00:00Z`) : null,
    debt.is_installment ? `${summary.paidCount} ${summary.paidCount === 1 ? 'paga' : 'pagas'}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="border-b border-line/50 last:border-b-0" data-debt-id={debt.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Recolher' : 'Abrir'} ${debt.title}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            size={14}
            className={cn('shrink-0 text-faint transition-transform', expanded && 'rotate-90')}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{debtLabel(debt, friends)}</span>
              {next?.overdue ? (
                <span className="rounded-full bg-neg/10 px-1.5 py-0.5 text-[10px] font-medium text-neg">atrasada</span>
              ) : null}
            </span>
            <span className="text-[11px] text-muted-foreground">{detail}</span>
          </div>
        </button>
        <MoneyValue
          amount={(youOwe ? -1 : 1) * ((next?.amount ?? summary.remaining) / 100)}
          currency={currency}
          tone={youOwe ? 'negative' : 'positive'}
          showSign="never"
          className="text-sm font-semibold"
        />
        <div className="flex items-center gap-1">
          {next ? (
            <Button size="sm" onClick={onPay} disabled={paying}>
              {youOwe ? 'Paguei' : 'Recebi'}
            </Button>
          ) : null}
          {canUndo ? (
            <Button size="xs" variant="ghost" onClick={onUndo} disabled={undoing}>
              <Undo2 size={12} />
              Desfazer
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" aria-label={`Editar ${debt.title}`} onClick={onEdit}>
            <Pencil size={13} />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Excluir ${debt.title}`} onClick={onDelete}>
            <Trash2 size={13} className="text-neg" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 pb-3 pl-6 pr-1">
          {summary.schedule.some(
            item => item.status === 'paid' && item.dueDate !== null && item.dueDate > todayIso(),
          ) ? (
            <p className="rounded-md border border-line/60 bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
              Há parcelas pagas com vencimento no futuro. Ajuste a <strong className="font-medium">primeira parcela</strong> em Editar para corrigir as datas.
            </p>
          ) : null}
          <div className="overflow-hidden rounded-md border border-line/60">
            <div className="flex items-center justify-between border-b border-line/60 bg-surface-2/40 px-3 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-widest text-faint">Parcelas</span>
              <span className="text-[10.5px] text-muted-foreground">
                {summary.paidCount}/{summary.totalCount} pagas · faltam {formatMoney(summary.remaining / 100, currency)}
              </span>
            </div>
            {summary.schedule.map(item => (
              <InstallmentRow
                key={item.number}
                item={item}
                total={summary.totalCount}
                lastPaidNumber={summary.paidCount}
                youOwe={youOwe}
                currency={currency}
                canUndo={canUndo}
                paying={paying}
                undoing={undoing}
                onPay={onPay}
                onUndo={onUndo}
              />
            ))}
          </div>

          <DebtHistoryBlock
            debtId={debt.id}
            ledger={ledger}
            currency={currency}
            legacyPaid={summary.schedule.filter(item => item.legacy).length}
          />
        </div>
      ) : null}
    </div>
  )
}

function InstallmentRow({
  item,
  total,
  lastPaidNumber,
  youOwe,
  currency,
  canUndo,
  paying,
  undoing,
  onPay,
  onUndo,
}: {
  item: DebtInstallment
  total: number
  lastPaidNumber: number
  youOwe: boolean
  currency: string
  canUndo: boolean
  paying: boolean
  undoing: boolean
  onPay: () => void
  onUndo: () => void
}) {
  const paid = item.status === 'paid'
  const isNext = item.status === 'next'
  const canUndoThis = paid && canUndo && item.number === lastPaidNumber
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/40 px-3 py-1.5 last:border-b-0',
        isNext && 'bg-surface-2/50',
        paid && 'opacity-80',
      )}
    >
      <span
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-medium',
          paid ? 'bg-pos/10 text-pos' : isNext ? 'bg-surface-3 text-foreground' : 'text-faint',
        )}
      >
        {paid ? <Check size={11} /> : item.number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
          Parcela {item.number}/{total}
          {isNext ? <span className="text-[10px] uppercase tracking-wide text-faint">próxima</span> : null}
          {item.overdue ? <span className="text-[10px] font-medium text-neg">atrasada</span> : null}
        </span>
        <span className="text-[10.5px] text-faint">
          {item.dueDate ? `${paid ? 'venceu' : 'vence'} ${formatDate(`${item.dueDate}T00:00:00Z`)}` : 'sem data'}
          {item.paidAt ? ` · paga em ${formatLocalDate(item.paidAt)}` : item.legacy ? ' · paga antes do extrato' : ''}
        </span>
      </div>
      <MoneyValue
        amount={(youOwe ? -1 : 1) * (item.amount / 100)}
        currency={currency}
        tone={paid ? 'neutral' : youOwe ? 'negative' : 'positive'}
        showSign="never"
        className="text-xs"
      />
      {isNext ? (
        <Button size="xs" onClick={onPay} disabled={paying}>
          {youOwe ? 'Paguei' : 'Recebi'}
        </Button>
      ) : null}
      {canUndoThis ? (
        <Button size="xs" variant="ghost" onClick={onUndo} disabled={undoing}>
          <Undo2 size={11} />
          Desfazer
        </Button>
      ) : null}
    </div>
  )
}

function DebtHistoryBlock({
  debtId,
  ledger,
  currency,
  legacyPaid,
}: {
  debtId: string
  ledger: ReturnType<typeof usePlan>['ledger']
  currency: string
  legacyPaid: number
}) {
  const rows = debtHistory(debtId, ledger)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-faint">
          <History size={11} />
          Histórico
        </span>
        <Link to="/extrato" className="text-[10.5px] text-faint underline">
          Ver no extrato
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {legacyPaid > 0
            ? `${legacyPaid} ${legacyPaid === 1 ? 'parcela paga' : 'parcelas pagas'} antes do extrato, sem data de pagamento.`
            : 'Nenhum pagamento lançado no extrato ainda.'}
        </p>
      ) : (
        rows.map(row => <HistoryRow key={row.id} row={row} currency={currency} />)
      )}
    </div>
  )
}

function HistoryRow({ row, currency }: { row: DebtHistoryRow; currency: string }) {
  const reversal = row.kind === 'reversal'
  return (
    <div className={cn('flex items-center gap-2 px-1', reversal && 'opacity-60')}>
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          reversal ? 'bg-surface-3' : row.reversed ? 'bg-neg/40' : 'bg-pos',
        )}
      />
      <span className={cn('min-w-0 flex-1 truncate text-[11px] text-muted-foreground', row.reversed && 'line-through')}>
        {reversal ? 'Estorno' : 'Pagamento'}
        {row.occurrenceDate ? ` · venceu ${formatDate(`${row.occurrenceDate}T00:00:00Z`)}` : ''}
        {` · ${formatLocalDate(row.postedAt)}`}
      </span>
      <MoneyValue
        amount={row.amount / 100}
        currency={currency}
        tone={row.amount >= 0 ? 'positive' : 'negative'}
        showSign="always"
        className="text-[11px]"
      />
    </div>
  )
}

function DebtEditDialog({
  debt,
  friends,
  currency,
  onOpenChange,
  onSaved,
}: {
  debt: PeerDebtResponse | null
  friends: { id: string; name: string }[]
  currency: string
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <AppModal
      open={debt !== null}
      onOpenChange={onOpenChange}
      title="Editar dívida"
      description="Mude o valor, as parcelas e o próximo vencimento. O histórico de pagamentos continua igual."
    >
      {debt ? (
        <DebtEditForm
          key={debt.id}
          debt={debt}
          friends={friends}
          currency={currency}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </AppModal>
  )
}

function DebtEditForm({
  debt,
  friends,
  currency,
  onSaved,
  onClose,
}: {
  debt: PeerDebtResponse
  friends: { id: string; name: string }[]
  currency: string
  onSaved: () => void
  onClose: () => void
}) {
  const [friendId, setFriendId] = useState(debt.friend_id)
  const [title, setTitle] = useState(debt.title)
  const [amountText, setAmountText] = useState(
    Math.abs(debt.amount).toFixed(2).replace('.', ','),
  )
  const [direction, setDirection] = useState<'owe' | 'owed'>(debt.amount < 0 ? 'owe' : 'owed')
  const [installment, setInstallment] = useState(debt.is_installment)
  const [totalText, setTotalText] = useState(String(debt.total_installments ?? ''))
  const [frequency, setFrequency] = useState(debt.frequency ?? 'monthly')
  const initialDate = datePart(debt.is_installment ? (debt.anchor_date ?? debt.date) : debt.date)
  const [anchorDate, setAnchorDate] = useState(initialDate)
  const [nextDate, setNextDate] = useState(
    debt.next_occurrence
      ? datePart(debt.next_occurrence)
      : dueFromAnchor(initialDate, debt.paid_installments, debt.frequency) ?? '',
  )
  const [nextDirty, setNextDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseDecimalInput(amountText)
  const totalNumber = Number.parseInt(totalText, 10)
  const paid = debt.paid_installments
  const remainingTotal = Number.isFinite(totalNumber) ? totalNumber - paid : 0
  const perInstallment = amount !== null && Number.isFinite(totalNumber) && totalNumber > 0
    ? Math.trunc(Math.round(Math.abs(amount) * 100) / totalNumber) / 100
    : 0
  const hasPayments = paid > 0 || debt.is_confirmed

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Dê um nome para a dívida')
      if (amount === null || amount <= 0) throw new Error('Informe o valor')
      if (!anchorDate) throw new Error('Informe a data')
      if (installment) {
        if (!Number.isFinite(totalNumber) || totalNumber < 2) throw new Error('Informe em quantas parcelas')
        if (totalNumber < paid) throw new Error(`Esta dívida já tem ${paid} parcelas pagas`)
      }

      await updatePeerDebt(debt.id, {
        friend_id: friendId,
        title: title.trim(),
        amount: Math.round((direction === 'owe' ? -1 : 1) * Math.abs(amount) * 100),
        date: `${anchorDate}T00:00:00Z`,
        is_installment: installment,
        total_installments: installment ? totalNumber : null,
        frequency: installment ? frequency : null,
        anchor_date: installment ? `${anchorDate}T00:00:00Z` : null,
        ...(installment && paid >= totalNumber
          ? { next_occurrence: null }
          : nextDirty
            ? {
                next_occurrence:
                  installment && nextDate ? `${nextDate}T00:00:00Z` : null,
              }
            : {}),
      })
    },
    onSuccess: () => {
      toast.success('Dívida atualizada')
      onSaved()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={event => {
        event.preventDefault()
        setError(null)
        save.mutate()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="debt-edit-friend" className="text-xs">Amigo</Label>
        <Select value={friendId} onValueChange={setFriendId}>
          <SelectTrigger id="debt-edit-friend" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {friends.map(friend => (
              <SelectItem key={friend.id} value={friend.id}>{friend.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="debt-edit-title" className="text-xs">Motivo</Label>
        <Input id="debt-edit-title" value={title} onChange={event => setTitle(event.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debt-edit-amount" className="text-xs">Valor total</Label>
          <ValueInput id="debt-edit-amount" value={amountText} onValueChange={setAmountText} allowNegative={false} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debt-edit-direction" className="text-xs">Quem deve</Label>
          <Select
            value={direction}
            onValueChange={value => setDirection(value as 'owe' | 'owed')}
            disabled={hasPayments}
          >
            <SelectTrigger id="debt-edit-direction" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owe">Eu devo</SelectItem>
              <SelectItem value="owed">Me devem</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {hasPayments ? (
        <p className="text-[11px] text-faint">
          A direção e o tipo não mudam depois de um pagamento; exclua e crie de novo se precisar inverter.
        </p>
      ) : null}

      <label className={cn('flex items-center gap-2 text-xs text-muted-foreground', hasPayments && 'opacity-60')}>
        <input
          type="checkbox"
          checked={installment}
          disabled={hasPayments}
          onChange={event => {
            const checked = event.target.checked
            setInstallment(checked)
            setNextDirty(true)
            if (checked) {
              setNextDate(dueFromAnchor(anchorDate, paid, frequency) ?? anchorDate)
            } else {
              setNextDate('')
            }
          }}
        />
        É parcelada
      </label>

      {installment ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-edit-total" className="text-xs">Parcelas no total</Label>
              <Input
                id="debt-edit-total"
                inputMode="numeric"
                value={totalText}
                onChange={event => {
                  setTotalText(event.target.value.replace(/\D/g, ''))
                }}
                placeholder="6"
              />
              <span className="text-[10.5px] text-faint">Inclui as {paid} já pagas.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-edit-frequency" className="text-xs">Frequência</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="debt-edit-frequency" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEBT_FREQUENCIES.map(item => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-edit-anchor" className="text-xs">Primeira parcela</Label>
              <DateInput
                id="debt-edit-anchor"
                value={anchorDate}
                onChange={value => {
                  setAnchorDate(value)
                  setNextDate(dueFromAnchor(value, paid, frequency) ?? '')
                  setNextDirty(true)
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-edit-next" className="text-xs">Próximo vencimento</Label>
              <DateInput
                id="debt-edit-next"
                value={nextDate}
                onChange={value => {
                  setNextDate(value)
                  setNextDirty(true)
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line/60 bg-surface-2/40 px-3 py-2 text-[11px]">
            <span className="text-muted-foreground">
              {Number.isFinite(totalNumber) && totalNumber > 0
                ? `${totalNumber} parcelas de ${formatMoney(perInstallment, currency)}`
                : 'Defina o número de parcelas'}
            </span>
            <span className="text-faint">
              {remainingTotal > 0 ? `${remainingTotal} ${remainingTotal === 1 ? 'restante' : 'restantes'}` : 'nenhuma restante'}
            </span>
          </div>

          {paid >= totalNumber && Number.isFinite(totalNumber) && totalNumber > 0 ? (
            <p className="text-[11px] text-faint">
              Todas as parcelas estão pagas. Aumente o total para voltar a ter vencimento.
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debt-edit-date" className="text-xs">Data</Label>
          <DateInput id="debt-edit-date" value={anchorDate} onChange={setAnchorDate} />
        </div>
      )}

      {error ? <p role="alert" className="text-xs text-neg">{error}</p> : null}
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function DebtDialog({
  open,
  onOpenChange,
  accountId,
  friends,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  friends: { id: string; name: string }[]
  onSaved: () => void
}) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Nova dívida"
      description="Uma dívida sua entra no plano como uma conta. A de um amigo fica como lembrete."
    >
      <DebtForm key={open ? 'open' : 'closed'} accountId={accountId} friends={friends} onSaved={onSaved} onClose={() => onOpenChange(false)} />
    </AppModal>
  )
}

function DebtForm({
  accountId,
  friends,
  onSaved,
  onClose,
}: {
  accountId: string
  friends: { id: string; name: string }[]
  onSaved: () => void
  onClose: () => void
}) {
  const [friendId, setFriendId] = useState(friends[0]?.id ?? '')
  const [newFriend, setNewFriend] = useState('')
  const [title, setTitle] = useState('')
  const [amountText, setAmountText] = useState('')
  const [direction, setDirection] = useState<'owe' | 'owed'>('owe')
  const [date, setDate] = useState(todayIso)
  const [installment, setInstallment] = useState(false)
  const [total, setTotal] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [error, setError] = useState<string | null>(null)

  const amount = parseDecimalInput(amountText)
  const totalNumber = Number.parseInt(total, 10)

  const save = useMutation({
    mutationFn: async () => {
      if (amount === null || amount <= 0) throw new Error('Informe o valor')
      if (!title.trim()) throw new Error('Dê um nome para a dívida')
      if (installment && (!Number.isFinite(totalNumber) || totalNumber < 2)) {
        throw new Error('Informe em quantas parcelas')
      }

      let id = friendId
      if (!id) {
        if (!newFriend.trim()) throw new Error('Escolha ou crie um amigo')
        const created = await createFriend({ name: newFriend.trim() })
        id = created.id
      }

      await createPeerDebt({
        account_id: accountId,
        friend_id: id,
        amount: Math.round((direction === 'owe' ? -1 : 1) * Math.abs(amount) * 100),
        title: title.trim(),
        date: `${date}T00:00:00Z`,
        is_installment: installment,
        ...(installment
          ? {
              total_installments: totalNumber,
              frequency,
              anchor_date: `${date}T00:00:00Z`,
            }
          : {}),
      })
    },
    onSuccess: () => {
      toast.success('Dívida registrada')
      onSaved()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={event => {
        event.preventDefault()
        setError(null)
        save.mutate()
      }}
    >
      {friends.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debt-friend" className="text-xs">Amigo</Label>
          <Select value={friendId} onValueChange={setFriendId}>
            <SelectTrigger id="debt-friend" size="sm" className="w-full">
              <SelectValue placeholder="Escolha um amigo" />
            </SelectTrigger>
            <SelectContent>
              {friends.map(friend => (
                <SelectItem key={friend.id} value={friend.id}>{friend.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button type="button" className="self-start text-[11px] text-faint underline" onClick={() => setFriendId('')}>
            Criar um amigo novo
          </button>
        </div>
      ) : null}

      {friends.length === 0 || friendId === '' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debt-new-friend" className="text-xs">Nome do amigo</Label>
          <Input id="debt-new-friend" value={newFriend} onChange={event => setNewFriend(event.target.value)} placeholder="Ana" />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="debt-title" className="text-xs">Motivo</Label>
        <Input id="debt-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Pizza, aluguel, empréstimo..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debt-amount" className="text-xs">Valor</Label>
          <ValueInput id="debt-amount" value={amountText} onValueChange={setAmountText} allowNegative={false} placeholder="0,00" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debt-date" className="text-xs">{installment ? 'Primeira parcela' : 'Data'}</Label>
          <DateInput id="debt-date" value={date} onChange={setDate} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="debt-direction" className="text-xs">Quem deve</Label>
        <Select value={direction} onValueChange={value => setDirection(value as 'owe' | 'owed')}>
          <SelectTrigger id="debt-direction" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owe">Eu devo</SelectItem>
            <SelectItem value="owed">Me devem</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={installment} onChange={event => setInstallment(event.target.checked)} />
        É parcelada
      </label>

      {installment ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-total" className="text-xs">Parcelas</Label>
            <Input
              id="debt-total"
              inputMode="numeric"
              value={total}
              onChange={event => setTotal(event.target.value.replace(/\D/g, ''))}
              placeholder="6"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-frequency" className="text-xs">Frequência</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger id="debt-frequency" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEBT_FREQUENCIES.map(item => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-xs text-neg">{error}</p> : null}

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
