import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/AppModal'
import { MoneyValue } from '@/components/ui/money-value'
import type { PeerDebtResponse } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { calculateNextPayDate, debtStatus, getDisplayAmount } from '@/components/debt/debt-list-mappers'

interface FriendDebtDetailsModalProps {
  debt: PeerDebtResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm?: (id: string) => void
  onDelete?: (id: string) => void
  confirming?: boolean
  deleting?: boolean
}

export function FriendDebtDetailsModal({
  debt,
  open,
  onOpenChange,
  onConfirm,
  onDelete,
  confirming = false,
  deleting = false,
}: FriendDebtDetailsModalProps) {
  if (!debt) return null

  const status = debtStatus(debt)
  const nextPayDate = calculateNextPayDate(debt)
  const amount = getDisplayAmount(debt)

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={debt.description}
      description="Debt details"
      contentClassName="max-h-[85vh] overflow-y-auto sm:max-w-lg h-screen w-screen max-w-none rounded-none sm:h-auto sm:w-auto sm:rounded-lg"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Next date</span>
          <span>{nextPayDate ? formatDate(nextPayDate) : '-'}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Remaining</span>
          <MoneyValue amount={amount} currency="BRL" showSign="auto" tone="auto" className="font-semibold" />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          {onDelete ? (
            <Button variant="outline" onClick={() => onDelete(debt.id)} disabled={deleting}>Delete</Button>
          ) : null}
          {onConfirm && !debt.is_confirmed ? (
            <Button onClick={() => onConfirm(debt.id)} disabled={confirming}>Confirm</Button>
          ) : null}
        </div>
      </div>
    </AppModal>
  )
}
