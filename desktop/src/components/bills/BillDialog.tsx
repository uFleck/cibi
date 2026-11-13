import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppModal } from '@/components/AppModal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ValueInput } from '@/components/ui/value-input'
import { createTransaction, deleteTransaction, updateTransaction, type TransactionResponse } from '@/lib/api'
import { parseDecimalInput } from '@/lib/locale'
import { todayIso } from '@/lib/today'

type BillKind = 'recurring' | 'one-off' | 'installment' | 'as-needed'

const KIND_LABELS: Record<BillKind, string> = {
  recurring: 'Despesa fixa (todo mês)',
  'one-off': 'Despesa única',
  installment: 'Compra parcelada',
  'as-needed': 'Gasto mensal variável',
}

const FREQUENCIES = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'bi-weekly', label: 'Quinzenal' },
  { value: 'yearly', label: 'Anual' },
]

function dateOf(value: string | null | undefined): string {
  if (!value) return todayIso()
  return value.slice(0, 10)
}

function kindOf(bill: TransactionResponse | null): BillKind {
  if (!bill) return 'recurring'
  if (bill.is_as_needed) return 'as-needed'
  if (bill.is_installment) return 'installment'
  if (bill.is_recurring) return 'recurring'
  return 'one-off'
}

interface BillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  bill: TransactionResponse | null
  onSaved: () => void
}

/** One form to create and change every kind of bill. */
export function BillDialog({ open, onOpenChange, accountId, bill, onSaved }: BillDialogProps) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={bill ? 'Editar despesa' : 'Nova despesa'}
      description="O valor é uma estimativa; ao pagar você informa quanto foi de verdade."
    >
      <BillForm key={`${bill?.id ?? 'new'}-${open ? 'open' : 'closed'}`} accountId={accountId} bill={bill} onSaved={onSaved} onClose={() => onOpenChange(false)} />
    </AppModal>
  )
}

function BillForm({
  accountId,
  bill,
  onSaved,
  onClose,
}: {
  accountId: string
  bill: TransactionResponse | null
  onSaved: () => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<BillKind>(() => kindOf(bill))
  const [title, setTitle] = useState(bill?.title ?? '')
  const [amountText, setAmountText] = useState(bill ? Math.abs(bill.amount).toFixed(2) : '')
  const [frequency, setFrequency] = useState(bill?.frequency ?? 'monthly')
  const [date, setDate] = useState(() => dateOf(bill?.next_occurrence ?? bill?.anchor_date ?? bill?.timestamp))
  const [total, setTotal] = useState(bill?.total_installments ? String(bill.total_installments) : '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const amount = parseDecimalInput(amountText)
  const totalNumber = Number.parseInt(total, 10)

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Dê um nome para a despesa')
      if (amount === null || amount <= 0) throw new Error('Informe o valor')
      if (kind === 'installment' && (!Number.isFinite(totalNumber) || totalNumber < 1)) {
        throw new Error('Informe em quantas parcelas')
      }
      const negative = -Math.abs(amount)
      const iso = `${date}T00:00:00Z`

      if (!bill) {
        const base = {
          account_id: accountId,
          title: title.trim(),
          amount: negative,
          requires_confirmation: true,
        }
        if (kind === 'as-needed') {
          await createTransaction({
            ...base,
            is_recurring: true,
            is_as_needed: true,
            frequency: 'monthly',
            anchor_date: `${todayIso()}T00:00:00Z`,
          })
        } else if (kind === 'installment') {
          await createTransaction({
            ...base,
            is_installment: true,
            total_installments: totalNumber,
            frequency,
            anchor_date: iso,
          })
        } else if (kind === 'recurring') {
          await createTransaction({ ...base, is_recurring: true, frequency, anchor_date: iso })
        } else {
          await createTransaction({ ...base, anchor_date: iso })
        }
        return
      }

      const common = { title: title.trim(), amount: negative }
      if (kind === 'as-needed') {
        await updateTransaction(bill.id, {
          ...common,
          is_as_needed: true,
          is_recurring: true,
          is_installment: false,
          frequency: 'monthly',
        })
      } else if (kind === 'installment') {
        await updateTransaction(bill.id, {
          ...common,
          is_as_needed: false,
          is_installment: true,
          is_recurring: false,
          total_installments: totalNumber,
          frequency,
          anchor_date: iso,
          next_occurrence: iso,
        })
      } else if (kind === 'recurring') {
        await updateTransaction(bill.id, {
          ...common,
          is_as_needed: false,
          is_installment: false,
          is_recurring: true,
          frequency,
          anchor_date: iso,
          next_occurrence: iso,
        })
      } else {
        await updateTransaction(bill.id, {
          ...common,
          is_as_needed: false,
          is_installment: false,
          is_recurring: false,
          anchor_date: iso,
          next_occurrence: iso,
        })
      }
    },
    onSuccess: () => {
      toast.success(bill ? 'Despesa atualizada' : 'Despesa criada')
      onSaved()
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const remove = useMutation({
    mutationFn: () => deleteTransaction(bill!.id),
    onSuccess: () => {
      toast.success('Despesa excluída; os pagamentos ficam no extrato')
      onSaved()
      onClose()
    },
    onError: (err: Error) => toast.error(err.message || 'Não deu para excluir'),
  })

  const showDate = kind !== 'as-needed'
  const showFrequency = kind === 'recurring' || kind === 'installment'

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        setError(null)
        save.mutate()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bill-kind" className="text-xs">Tipo</Label>
        <Select value={kind} onValueChange={value => setKind(value as BillKind)}>
          <SelectTrigger id="bill-kind" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as BillKind[]).map(value => (
              <SelectItem key={value} value={value}>{KIND_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bill-title" className="text-xs">Nome</Label>
        <Input
          id="bill-title"
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Aluguel, mercado, celular..."
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bill-amount" className="text-xs">
            {kind === 'as-needed' ? 'Orçamento por mês' : 'Valor'}
          </Label>
          <ValueInput
            id="bill-amount"
            value={amountText}
            onValueChange={setAmountText}
            allowNegative={false}
            placeholder="0,00"
          />
        </div>
        {showDate ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-date" className="text-xs">Vencimento</Label>
            <DateInput id="bill-date" value={date} onChange={setDate} />
          </div>
        ) : null}
      </div>

      {showFrequency ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bill-frequency" className="text-xs">Repete</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger id="bill-frequency" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map(item => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === 'installment' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill-total" className="text-xs">Parcelas</Label>
              <Input
                id="bill-total"
                inputMode="numeric"
                value={total}
                onChange={event => setTotal(event.target.value.replace(/\D/g, ''))}
                placeholder="12"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === 'as-needed' ? (
        <p className="text-xs text-muted-foreground">
          Sem vencimento: você compra quando precisar e cada compra desconta deste orçamento no mês.
        </p>
      ) : null}

      {error ? <p role="alert" className="text-xs text-neg">{error}</p> : null}

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button type="submit" size="sm" disabled={save.isPending}>
          <Save size={14} />
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
        {bill ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-neg"
            onClick={() => setConfirmDelete(true)}
            disabled={remove.isPending}
          >
            <Trash2 size={14} />
            Excluir
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          remove.mutate()
        }}
        title="Excluir esta despesa?"
        description="Os pagamentos já feitos continuam no extrato. A despesa deixa de aparecer no plano."
        confirmLabel="Excluir"
      />
    </form>
  )
}
