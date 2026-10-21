import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConfirmAmountDialog } from '@/components/ConfirmAmountDialog'
import {
  confirmInstallmentTransaction,
  confirmTransaction,
  effectiveAmount,
  skipTransaction,
  updateTransaction,
  type TransactionResponse,
} from '@/lib/api'
import { asNeededLeft } from '@/lib/bills'
import { formatMoney } from '@/lib/format'

export interface BillActions {
  /** Pays the bill: a recurring one after asking what it really cost, anything else right away. */
  pay: (t: TransactionResponse) => void
  /** Moves a recurring bill to its next date without paying it. */
  skip: (t: TransactionResponse) => void
  /** Marks or unmarks "not sure": an uncertain bill is left out of every forecast. */
  toggleUncertain: (t: TransactionResponse) => void
  /** The amount dialog; render it once on the page. */
  dialog: ReactNode
}

/** What the amount dialog suggests, and why. */
function suggestionFor(t: TransactionResponse, currency: string): { suggested: number; hint: string } {
  if (t.is_as_needed) {
    const left = asNeededLeft(t)
    return {
      suggested: 0,
      hint: left > 0
        ? `Ainda faltam ${formatMoney(left, currency)} do orçamento deste mês.`
        : `O orçamento deste mês já foi usado (${formatMoney(-left, currency)} acima).`,
    }
  }
  const samples = t.estimate_samples ?? 0
  return {
    suggested: effectiveAmount(t),
    hint: t.estimate_source && samples > 0
      ? `Sugestão: a mediana dos últimos ${samples} pagamentos parecidos.`
      : 'Sugestão: o valor cadastrado. Mude se pagou outro valor.',
  }
}

export function useBillActions(currency = 'BRL'): BillActions {
  const queryClient = useQueryClient()
  const [payFor, setPayFor] = useState<TransactionResponse | null>(null)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['account'] })
    queryClient.invalidateQueries({ queryKey: ['budget'] })
  }
  const failed = (fallback: string) => (error: Error) => toast.error(error.message || fallback)

  const payMutation = useMutation({
    mutationFn: ({ t, amount }: { t: TransactionResponse; amount?: number }) =>
      t.is_installment ? confirmInstallmentTransaction(t.id) : confirmTransaction(t.id, amount),
    onSuccess: (_data, { t }) => toast.success(`${t.title}: pago`),
    onError: failed('Não deu para registrar o pagamento'),
    onSettled: refresh,
  })

  const skipMutation = useMutation({
    mutationFn: (t: TransactionResponse) => skipTransaction(t.id),
    onSuccess: (_data, t) => toast.success(`${t.title}: pulado este mês`),
    onError: failed('Não deu para pular'),
    onSettled: refresh,
  })

  const uncertainMutation = useMutation({
    mutationFn: (t: TransactionResponse) => updateTransaction(t.id, { is_uncertain: !t.is_uncertain }),
    onSuccess: (_data, t) =>
      toast.success(t.is_uncertain ? `${t.title}: volta para a conta` : `${t.title}: fica fora da conta até decidir`),
    onError: failed('Não deu para mudar'),
    onSettled: refresh,
  })

  const suggestion = payFor ? suggestionFor(payFor, currency) : null

  return {
    pay: t => (t.is_installment || !t.is_recurring ? payMutation.mutate({ t }) : setPayFor(t)),
    skip: t => skipMutation.mutate(t),
    toggleUncertain: t => uncertainMutation.mutate(t),
    dialog: (
      <ConfirmAmountDialog
        open={payFor !== null}
        title={payFor?.title ?? ''}
        suggested={suggestion?.suggested ?? 0}
        samples={0}
        hint={suggestion?.hint}
        sign={payFor && payFor.amount > 0 ? 1 : -1}
        onConfirm={amount => {
          if (payFor) payMutation.mutate({ t: payFor, amount })
          setPayFor(null)
        }}
        onCancel={() => setPayFor(null)}
      />
    ),
  }
}
