import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ValueInput } from '@/components/ui/value-input'
import { parseDecimalInput } from '@/lib/locale'

interface ConfirmAmountDialogProps {
  open: boolean
  title: string
  /** The estimate, shown as the suggestion. Negative for an expense. */
  suggested: number
  /** How many past payments the suggestion comes from. */
  samples: number
  /** Explains the suggestion instead of the default text about past payments. */
  hint?: string
  /** Shown when the suggestion is zero, so the field starts empty. Negative for an expense. */
  sign?: -1 | 1
  onConfirm: (amount: number) => void
  onCancel: () => void
}

/** Asks what a variable-amount bill really cost before it is marked paid. The amount is returned signed like the transaction. */
export function ConfirmAmountDialog({ open, onCancel, ...form }: ConfirmAmountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onCancel() }}>
      <DialogContent>
        {/* Mounted only while open, so it starts from the suggestion every time. */}
        <AmountForm onCancel={onCancel} {...form} />
      </DialogContent>
    </Dialog>
  )
}

function AmountForm({ title, suggested, samples, hint, sign: givenSign, onConfirm, onCancel }: Omit<ConfirmAmountDialogProps, 'open'>) {
  const [text, setText] = useState(() => (suggested === 0 ? '' : Math.abs(suggested).toFixed(2)))
  const sign = givenSign ?? (suggested < 0 ? -1 : 1)
  const parsed = parseDecimalInput(text)
  const amount = parsed === null || parsed === 0 ? null : sign * Math.abs(parsed)

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        if (amount !== null) onConfirm(amount)
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>Quanto foi {title}?</DialogTitle>
        <DialogDescription>
          {hint ?? (samples > 0
            ? `A sugestão é a mediana ${samples === 1 ? 'do último pagamento parecido' : `dos últimos ${samples} pagamentos parecidos`}.`
            : 'Ainda não há pagamentos anteriores para estimar, então a sugestão é o valor definido.')}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-amount" className="text-xs">Valor pago</Label>
        <ValueInput id="confirm-amount" value={text} onValueChange={setText} allowNegative={false} autoFocus />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={amount === null}>Marcar como pago</Button>
      </DialogFooter>
    </form>
  )
}
