import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ValueInput } from '@/components/ui/value-input'
import { saveReserveConfig, withdrawReserve, type ReserveResponse } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { parseDecimalInput } from '@/lib/locale'
import { reserveKey } from './useReserve'

interface DialogProps {
  open: boolean
  accountId: string
  currency: string
  reserve: ReserveResponse
  onClose: () => void
}

function fixed(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Edits how big the reserve should be (months of obligations) and how fast it fills. */
export function ReserveSettingsDialog({ open, onClose, ...form }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onClose() }}>
      <DialogContent>
        {/* Mounted only while open, so the fields start from the saved settings every time. */}
        <SettingsForm onClose={onClose} {...form} />
      </DialogContent>
    </Dialog>
  )
}

function SettingsForm({ accountId, currency, reserve, onClose }: Omit<DialogProps, 'open'>) {
  const queryClient = useQueryClient()
  // A first visit switches it on: opening the dialog from "Set up" means you want it.
  const [enabled, setEnabled] = useState(reserve.enabled || reserve.entries.length === 0)
  const [months, setMonths] = useState(String(reserve.target_months))
  const [start, setStart] = useState(fixed(reserve.start_amount))
  const [step, setStep] = useState(fixed(reserve.step_amount))
  const [cap, setCap] = useState(String(reserve.cap_percent))

  const parsed = {
    months: parseDecimalInput(months),
    start: parseDecimalInput(start),
    step: parseDecimalInput(step),
    cap: parseDecimalInput(cap),
  }
  const valid =
    parsed.months !== null && parsed.months > 0 && parsed.start !== null && parsed.start >= 0 &&
    parsed.step !== null && parsed.step >= 0 && parsed.cap !== null && parsed.cap >= 0 && parsed.cap <= 100

  const save = useMutation({
    mutationFn: () =>
      saveReserveConfig({
        account_id: accountId,
        enabled,
        target_months: parsed.months ?? 1,
        start_amount: parsed.start ?? 0,
        step_amount: parsed.step ?? 0,
        cap_percent: parsed.cap ?? 5,
      }),
    onSuccess: data => {
      queryClient.setQueryData(reserveKey(accountId), data)
      toast.success('Reserva salva')
      onClose()
    },
    onError: error => toast.error((error as Error).message || 'Não deu para salvar a reserva'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['reserve'] }),
  })

  const money = (n: number) => formatMoney(n, currency)
  const targetPreview = (parsed.months ?? 0) * reserve.monthly_obligations

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (valid) save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>Reserva</DialogTitle>
        <DialogDescription>
          Money set aside on every payday that the purchase check never spends. It starts small and grows each month.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="reserve-enabled" className="text-xs">Separar para a reserva em todo recebimento</Label>
        <Switch id="reserve-enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reserve-months" className="text-xs">Meta, em meses de contas</Label>
        <Input id="reserve-months" className="num" inputMode="decimal" value={months} onChange={e => setMonths(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Um mês de contas é {money(reserve.monthly_obligations)}, então a meta é {money(targetPreview)}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reserve-start" className="text-xs">Separado por recebimento, no início</Label>
          <ValueInput id="reserve-start" value={start} onValueChange={setStart} allowNegative={false} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reserve-step" className="text-xs">Aumento mensal</Label>
          <ValueInput id="reserve-step" value={step} onValueChange={setStep} allowNegative={false} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reserve-cap" className="text-xs">Nunca mais que este percentual de um recebimento</Label>
        <Input id="reserve-cap" className="num" inputMode="decimal" value={cap} onChange={e => setCap(e.target.value)} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={!valid || save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Takes money out of the reserve. A reason is required, so each withdrawal leaves a trace. */
export function ReserveWithdrawDialog({ open, onClose, ...form }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onClose() }}>
      <DialogContent>
        <WithdrawForm onClose={onClose} {...form} />
      </DialogContent>
    </Dialog>
  )
}

function WithdrawForm({ accountId, currency, reserve, onClose }: Omit<DialogProps, 'open'>) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const parsed = parseDecimalInput(amount)
  const valid = parsed !== null && parsed > 0 && parsed <= reserve.balance && note.trim() !== ''

  const withdraw = useMutation({
    mutationFn: () => withdrawReserve({ account_id: accountId, amount: parsed ?? 0, note: note.trim() }),
    onSuccess: data => {
      queryClient.setQueryData(reserveKey(accountId), data)
      toast.success('Retirado da reserva')
      onClose()
    },
    onError: error => toast.error((error as Error).message || 'Não deu para usar a reserva'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['reserve'] }),
  })

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (valid) withdraw.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>Usar a reserva</DialogTitle>
        <DialogDescription>
          The reserve holds {formatMoney(reserve.balance, currency)}. Taking from it is for emergencies, and it is logged with your reason.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reserve-withdraw-amount" className="text-xs">Valor</Label>
        <ValueInput id="reserve-withdraw-amount" value={amount} onValueChange={setAmount} allowNegative={false} autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reserve-withdraw-note" className="text-xs">Para que você precisa?</Label>
        <Input id="reserve-withdraw-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Conserto do carro" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button type="submit" size="sm" variant="destructive" disabled={!valid || withdraw.isPending}>
          {withdraw.isPending ? 'Salvando...' : 'Usar reserva'}
        </Button>
      </DialogFooter>
    </form>
  )
}
