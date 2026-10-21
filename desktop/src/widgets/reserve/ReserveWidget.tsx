import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markReserveMoved, type ReserveResponse } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { ReserveSettingsDialog, ReserveWithdrawDialog } from './ReserveDialogs'
import { useReserve } from './useReserve'

function months(n: number): string {
  return `${Math.round(n * 10) / 10} ${Math.abs(n - 1) < 0.05 ? 'mês' : 'meses'}`
}

/** The reserve: how much is set aside, how far it is from the target, and what to do on the next payday. */
export function ReserveWidget({ accountId, currency }: { accountId: string; currency: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useReserve(accountId)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)

  const moved = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await markReserveMoved(id)
    },
    onSuccess: () => toast.success('Marcado como transferido'),
    onError: error => toast.error((error as Error).message || 'Não deu para atualizar a reserva'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['reserve'] }),
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando reserva...</p>
  if (isError || !data) return <p className="text-sm text-muted-foreground">Não deu para carregar a reserva.</p>

  const money = (n: number) => formatMoney(n, currency)
  const dialogProps = { accountId, currency, reserve: data }

  const dialogs = (
    <>
      <ReserveSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} {...dialogProps} />
      <ReserveWithdrawDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} {...dialogProps} />
    </>
  )

  if (!data.enabled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Set money aside on every payday, before it looks spendable. The purchase check treats it as untouchable.
        </p>
        <div>
          <Button size="sm" onClick={() => setSettingsOpen(true)}>Configurar a reserva</Button>
        </div>
        {dialogs}
      </div>
    )
  }

  const pendingTotal = data.pending_transfers.reduce((sum, e) => sum + e.amount, 0)
  const reached = data.target > 0 && data.balance >= data.target

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-2xl font-semibold">{money(data.balance)}</span>
        <span className="num text-xs text-muted-foreground">de {money(data.target)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Progresso da reserva"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(data.progress * 100)}
      >
        <div className="h-full rounded-full bg-hl" style={{ width: `${data.progress * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {data.months_covered === null
          ? 'Ainda não há contas recorrentes, então não há meta.'
          : `Cobre ${months(data.months_covered)} das contas, com meta de ${months(data.target_months)}.`}
      </p>

      {data.pending_transfers.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-hl/40 bg-hl/10 px-3 py-2">
          <span className="text-xs">
            Mover <span className="num font-medium">{money(pendingTotal)}</span> para seu investimento
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={moved.isPending}
            onClick={() => moved.mutate(data.pending_transfers.map(e => e.id))}
          >
            Feito
          </Button>
        </div>
      )}

      <PaceLines data={data} money={money} reached={reached} />

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>Configurações</Button>
        <Button size="sm" variant="ghost" disabled={data.balance <= 0} onClick={() => setWithdrawOpen(true)}>
          Usar reserva
        </Button>
      </div>
      {dialogs}
    </div>
  )
}

function PaceLines({ data, money, reached }: { data: ReserveResponse; money: (n: number) => string; reached: boolean }) {
  if (reached) return <p className="text-xs text-pos">Meta atingida. Mantenha assim.</p>
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      {data.next_contribution && (
        <span>
          Próximo recebimento, {formatDate(data.next_contribution.payday)}:{' '}
          <span className="num text-foreground">{money(data.next_contribution.amount)}</span> entra
        </span>
      )}
      {data.eta ? (
        <span>Neste ritmo, a meta será atingida em {formatDate(data.eta)}.</span>
      ) : (
        <span>Neste ritmo, a meta não será atingida. Aumente o valor separado a cada recebimento.</span>
      )}
    </div>
  )
}
