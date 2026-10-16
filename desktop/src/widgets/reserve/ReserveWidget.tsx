import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markReserveMoved, type ReserveResponse } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { ReserveSettingsDialog, ReserveWithdrawDialog } from './ReserveDialogs'
import { useReserve } from './useReserve'

function months(n: number): string {
  return `${Math.round(n * 10) / 10} month${Math.abs(n - 1) < 0.05 ? '' : 's'}`
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
    onSuccess: () => toast.success('Marked as moved'),
    onError: error => toast.error((error as Error).message || 'Could not update the reserve'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['reserve'] }),
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading reserve...</p>
  if (isError || !data) return <p className="text-sm text-muted-foreground">Could not load the reserve.</p>

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
          <Button size="sm" onClick={() => setSettingsOpen(true)}>Set up the reserve</Button>
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
        <span className="num text-xs text-muted-foreground">of {money(data.target)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Reserve progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(data.progress * 100)}
      >
        <div className="h-full rounded-full bg-hl" style={{ width: `${data.progress * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {data.months_covered === null
          ? 'No recurring obligations yet, so there is no target.'
          : `Covers ${months(data.months_covered)} of obligations, aiming for ${months(data.target_months)}.`}
      </p>

      {data.pending_transfers.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-hl/40 bg-hl/10 px-3 py-2">
          <span className="text-xs">
            Move <span className="num font-medium">{money(pendingTotal)}</span> to your investment
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={moved.isPending}
            onClick={() => moved.mutate(data.pending_transfers.map(e => e.id))}
          >
            Done
          </Button>
        </div>
      )}

      <PaceLines data={data} money={money} reached={reached} />

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>Settings</Button>
        <Button size="sm" variant="ghost" disabled={data.balance <= 0} onClick={() => setWithdrawOpen(true)}>
          Use reserve
        </Button>
      </div>
      {dialogs}
    </div>
  )
}

function PaceLines({ data, money, reached }: { data: ReserveResponse; money: (n: number) => string; reached: boolean }) {
  if (reached) return <p className="text-xs text-pos">Target reached. Keep it there.</p>
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      {data.next_contribution && (
        <span>
          Next payday, {formatDate(data.next_contribution.payday)}:{' '}
          <span className="num text-foreground">{money(data.next_contribution.amount)}</span> goes in
        </span>
      )}
      {data.eta ? (
        <span>At this pace the target is reached on {formatDate(data.eta)}.</span>
      ) : (
        <span>At this pace the target is not reached. Raise what you set aside per payday.</span>
      )}
    </div>
  )
}
