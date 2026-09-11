import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDate, formatMoney } from '@/lib/format'
import {
  fetchLedger,
  deleteLedgerEntry,
  type LedgerEntryResponse,
  type AccountResponse,
} from '@/lib/api'

const BADGE_VARIANT: Record<
  LedgerEntryResponse['entry_type'],
  'destructive' | 'default' | 'secondary' | 'outline'
> = {
  payment: 'destructive',
  income: 'default',
  opening_balance: 'secondary',
  manual_adjustment: 'outline',
}

interface Props {
  account: AccountResponse
}

export function LedgerList({ account }: Props) {
  const queryClient = useQueryClient()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['ledger', account.id],
    queryFn: () => fetchLedger(account.id),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLedgerEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger', account.id] })
      toast.success('Entry deleted')
      setConfirmDeleteId(null)
    },
    onError: () => toast.error('Failed to delete entry'),
  })

  const entryToDelete = entries.find(e => e.id === confirmDeleteId)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading ledger">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
        ))}
        <span className="sr-only">Loading...</span>
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No ledger entries.</p>
  }

  return (
    <>
      <ConfirmDialog
        open={!!confirmDeleteId}
        onConfirm={() => {
          if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId)
        }}
        onCancel={() => setConfirmDeleteId(null)}
        title={`Delete "${entryToDelete?.description}"?`}
        description="This action cannot be undone."
      />

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
        {entries.map(entry => (
          <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{entry.description}</p>
              <p className="text-xs text-muted-foreground">{formatDate(entry.posted_at)}</p>
            </div>
            <Badge variant={BADGE_VARIANT[entry.entry_type]} className="shrink-0 text-xs">
              {entry.entry_type.replace('_', ' ')}
            </Badge>
            <span
              className={`text-sm font-medium tabular-nums shrink-0 ${
                entry.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'
              }`}
            >
              {formatMoney(entry.amount, account.currency)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-7 w-7"
              onClick={() => setConfirmDeleteId(entry.id)}
              aria-label={`Delete ${entry.description}`}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}
