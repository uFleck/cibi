import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { HandCoins, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
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
import { nextInstallmentDue } from '@/domain/engine/installment'
import { formatDate, formatMoney } from '@/lib/format'
import { parseDecimalInput } from '@/lib/locale'
import { todayIso } from '@/lib/today'
import { cn } from '@/lib/utils'

const PAGE = 'mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6'

function isActive(debt: PeerDebtResponse): boolean {
  if (debt.is_installment) {
    return debt.paid_installments < (debt.total_installments ?? 0)
  }
  return !debt.is_confirmed
}

function remainingAmount(debt: PeerDebtResponse): number {
  if (!debt.is_installment) return Math.abs(debt.amount)
  const total = debt.total_installments ?? 0
  const per = total > 0 ? Math.trunc(Math.abs(debt.amount) / total) : Math.abs(debt.amount)
  return Math.max(0, Math.abs(debt.amount) - per * debt.paid_installments)
}

function nextPayment(debt: PeerDebtResponse): { amount: number; date: string | null } {
  if (debt.is_installment) {
    const total = debt.total_installments ?? 0
    const per = total > 0 ? Math.trunc(Math.abs(debt.amount) / total) : Math.abs(debt.amount)
    const first = debt.anchor_date ?? debt.date
    let date: string | null = null
    try {
      const parsed = new Date(first.length === 10 ? `${first}T00:00:00Z` : first)
      if (!Number.isNaN(parsed.getTime())) {
        date = nextInstallmentDue(parsed, debt.paid_installments, debt.frequency ?? 'monthly').toISOString().slice(0, 10)
      }
    } catch {
      date = null
    }
    return { amount: per, date }
  }
  return { amount: Math.abs(debt.amount), date: debt.date.slice(0, 10) }
}

export function DebtsPage() {
  const plan = usePlan()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PeerDebtResponse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PeerDebtResponse | null>(null)
  const currency = plan.account?.currency ?? 'BRL'

  const paidIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entry of plan.ledger) {
      if (entry.transaction_id && entry.entry_type === 'payment' && !entry.reversed_by_id && !entry.reverses_entry_id) {
        ids.add(entry.transaction_id)
      }
    }
    return ids
  }, [plan.ledger])

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

  const active = plan.debts.filter(isActive)
  const settled = plan.debts.filter(debt => !isActive(debt))
  const owe = active.filter(debt => debt.amount < 0).reduce((sum, debt) => sum + remainingAmount(debt), 0)
  const owed = active.filter(debt => debt.amount > 0).reduce((sum, debt) => sum + remainingAmount(debt), 0)

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
            O que você deve entra no plano. O que devem a você fica aqui como lembrete.
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
            <MoneyValue amount={-owe} currency={currency} tone="negative" showSign="never" className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 py-3">
            <span className="text-[11px] font-medium uppercase tracking-widest text-faint">Devem a você</span>
            <MoneyValue amount={owed} currency={currency} tone="positive" showSign="never" className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 py-3">
            <span className="text-[11px] font-medium uppercase tracking-widest text-faint">Saldo</span>
            <span className={cn('num text-2xl font-semibold', owed - owe >= 0 ? 'text-pos' : 'text-neg')}>
              {formatMoney(owed - owe, currency)}
            </span>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Em aberto</h2>
        <Card>
          <CardContent className="flex flex-col py-1">
            {active.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <HandCoins size={24} className="text-faint" />
                <p className="text-sm text-muted-foreground">Nenhuma dívida em aberto.</p>
              </div>
            ) : (
              active.map(debt => {
                const friend = plan.friends.find(item => item.id === debt.friend_id)
                const next = nextPayment(debt)
                const youOwe = debt.amount < 0
                return (
                  <div key={debt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {youOwe ? `Você deve para ${friend?.name ?? 'amigo'}` : `${friend?.name ?? 'Amigo'} deve para você`}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {debt.title}
                        {debt.is_installment ? ` · parcela ${debt.paid_installments + 1}/${debt.total_installments ?? '?'}` : ''}
                        {next.date ? ` · ${formatDate(`${next.date}T00:00:00Z`)}` : ''}
                      </span>
                    </div>
                    <MoneyValue
                      amount={(youOwe ? -1 : 1) * next.amount}
                      currency={currency}
                      tone={youOwe ? 'negative' : 'positive'}
                      showSign="never"
                      className="text-sm font-semibold"
                    />
                    <div className="flex items-center gap-1">
                      <Button size="sm" onClick={() => settle.mutate(debt.id)} disabled={settle.isPending}>
                        {youOwe ? 'Paguei' : 'Recebi'}
                      </Button>
                      {paidIds.has(debt.id) ? (
                        <Button size="xs" variant="ghost" onClick={() => unsettle.mutate(debt.id)} disabled={unsettle.isPending}>
                          <Undo2 size={12} />
                          Desfazer
                        </Button>
                      ) : null}
                      <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEditing(debt)}>
                        <Pencil size={13} />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Excluir" onClick={() => setDeleteTarget(debt)}>
                        <Trash2 size={13} className="text-neg" />
                      </Button>
                    </div>
                  </div>
                )
              })
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
                const friend = plan.friends.find(item => item.id === debt.friend_id)
                const next = nextPayment(debt)
                return (
                  <div key={debt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 py-2 opacity-60 last:border-b-0">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {friend?.name ?? 'Amigo'} · {debt.title}
                    </span>
                    <MoneyValue amount={(debt.amount < 0 ? -1 : 1) * next.amount} currency={currency} tone="neutral" showSign="never" className="text-xs" />
                    {paidIds.has(debt.id) ? (
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

function DebtEditDialog({
  debt,
  onOpenChange,
  onSaved,
}: {
  debt: PeerDebtResponse | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <AppModal
      open={debt !== null}
      onOpenChange={onOpenChange}
      title="Editar dívida"
      description="Mude o motivo ou o valor. A data e as parcelas ficam como foram criadas."
    >
      {debt ? <DebtEditForm key={debt.id} debt={debt} onSaved={onSaved} onClose={() => onOpenChange(false)} /> : null}
    </AppModal>
  )
}

function DebtEditForm({ debt, onSaved, onClose }: { debt: PeerDebtResponse; onSaved: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(debt.title)
  const [amountText, setAmountText] = useState(Math.abs(debt.amount).toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const amount = parseDecimalInput(amountText)

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Dê um nome para a dívida')
      if (amount === null || amount <= 0) throw new Error('Informe o valor')
      await updatePeerDebt(debt.id, {
        title: title.trim(),
        amount: Math.sign(debt.amount) * Math.round(Math.abs(amount) * 100),
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
        <Label htmlFor="debt-edit-title" className="text-xs">Motivo</Label>
        <Input id="debt-edit-title" value={title} onChange={event => setTitle(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="debt-edit-amount" className="text-xs">Valor</Label>
        <ValueInput id="debt-edit-amount" value={amountText} onValueChange={setAmountText} allowNegative={false} />
      </div>
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
        ...(installment ? { total_installments: totalNumber, frequency: 'monthly', anchor_date: `${date}T00:00:00Z` } : {}),
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
          <Label htmlFor="debt-date" className="text-xs">Data</Label>
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
