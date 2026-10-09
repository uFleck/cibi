import { Plus } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EditSheet } from '@/components/EditSheet'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import type { TransactionResponse, FriendResponse } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { usePeerDebts } from './usePeerDebts'

type PeerDebts = ReturnType<typeof usePeerDebts>

export function FriendDebtsTab({ debts, friends, currentAccountCurrency, txnsLoading }: {
  debts: PeerDebts
  friends: FriendResponse[]
  currentAccountCurrency: string
  txnsLoading: boolean
}) {
  const { peerDebtFilter, setPeerDebtFilter, setIsCreatingDebt, setEditDebtDraft, setEditingDebtId, filteredPeerDebts, confirmPeerDebtMutation, deletePeerDebtMutation } = debts
  return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Friend</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={peerDebtFilter.friendId}
                onChange={e => setPeerDebtFilter(f => ({ ...f, friendId: e.target.value }))}
              >
                <option value="all">All friends</option>
                {friends.map((fr: FriendResponse) => (
                  <option key={fr.id} value={fr.id}>{fr.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Direction</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={peerDebtFilter.direction}
                onChange={e => setPeerDebtFilter(f => ({ ...f, direction: e.target.value as typeof f.direction }))}
              >
                <option value="all">All</option>
                <option value="i-owe">I owe</option>
                <option value="they-owe">They owe</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={peerDebtFilter.status}
                onChange={e => setPeerDebtFilter(f => ({ ...f, status: e.target.value as typeof f.status }))}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
            <Button size="sm" onClick={() => setIsCreatingDebt(true)} className="ml-auto">
              <Plus size={16} />
              New Debt
            </Button>
          </div>
          <Skeleton
            name="peer-debt-list"
            loading={txnsLoading}
            fallback={
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
                ))}
              </div>
            }
          >
            <SharedDebtList
              view="owner"
              items={filteredPeerDebts.map((txn: TransactionResponse) => {
                const friendName = friends.find((f: FriendResponse) => f.id === txn.friend_id)?.name ?? 'Unknown'
                const isConfirmed = txn.confirmed_at !== null
                const direction = txn.amount < 0 ? 'I owe' : 'They owe'
                return {
                  id: txn.id,
                  title: txn.description,
                  subtitle: `${friendName} · ${direction} · ${isConfirmed ? `confirmed ${formatDate(txn.confirmed_at!)}` : `pending ${formatDate(txn.anchor_date || txn.timestamp)}`}`,
                  amount: txn.is_installment && txn.total_installments
                    ? (txn.amount / txn.total_installments) * (txn.total_installments - (txn.paid_installments ?? 0))
                    : txn.amount,
                  currency: currentAccountCurrency,
                  status: {
                    label: isConfirmed ? 'Confirmed' : (txn.is_installment ? `${txn.paid_installments ?? 0}/${txn.total_installments ?? '?'} paid` : 'Pending'),
                    tone: isConfirmed ? 'default' as const : 'outline' as const,
                  },
                  canConfirm: !isConfirmed,
                  canEdit: true,
                  canDelete: true,
                }
              })}
              emptyTitle="No friend debts"
              emptyHint="Adjust filters or click New Debt"
              onConfirm={(id) => confirmPeerDebtMutation.mutate(id)}
              onEdit={(id) => {
                const txn = filteredPeerDebts.find((t: TransactionResponse) => t.id === id)
                if (!txn) return
                setEditDebtDraft({
                  amount: String(Math.abs(txn.amount)),
                  description: txn.description,
                })
                setEditingDebtId(id)
              }}
              onDelete={(id) => deletePeerDebtMutation.mutate(id)}
            />
          </Skeleton>
        </div>
  )
}

export function FriendDebtSheets({ debts, friends, accountId }: {
  debts: PeerDebts
  friends: FriendResponse[]
  accountId: string
}) {
  const {
    isCreatingDebt, setIsCreatingDebt, debtForm, setDebtForm, createDebtMutation,
    editingDebtId, setEditingDebtId, editDebtDraft, setEditDebtDraft, updateDebtMutation, filteredPeerDebts,
  } = debts
  const currentAccountId = accountId
  return (
    <>
      <EditSheet
        open={isCreatingDebt}
        onOpenChange={(open) => !open && setIsCreatingDebt(false)}
        title="New Friend Debt"
        description="Record a debt between you and a friend."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!debtForm.friend_id || !debtForm.amount || !debtForm.description) return
            const amt = parseFloat(debtForm.amount)
            if (isNaN(amt) || amt === 0) return
            createDebtMutation.mutate({
              account_id: currentAccountId!,
              friend_id: debtForm.friend_id,
              amount: Math.round(amt * 100),
              description: debtForm.description,
              date: debtForm.date || new Date().toISOString(),
            })
          }}
        >
          <div className="flex flex-col gap-1">
            <Label>Friend</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={debtForm.friend_id}
              onChange={e => setDebtForm(f => ({ ...f, friend_id: e.target.value }))}
              required
            >
              <option value="">Select friend...</option>
              {friends.map((fr: FriendResponse) => (
                <option key={fr.id} value={fr.id}>{fr.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Amount</Label>
            <p className="text-xs text-muted-foreground">Positive = they owe you. Negative = you owe them.</p>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 50.00 or -30.00"
              value={debtForm.amount}
              onChange={e => setDebtForm(f => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Input
              placeholder="e.g. Dinner, Movie tickets"
              value={debtForm.description}
              onChange={e => setDebtForm(f => ({ ...f, description: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Date</Label>
            <Input
              type="date"
              value={debtForm.date}
              onChange={e => setDebtForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setIsCreatingDebt(false)}>Cancel</Button>
            <Button type="submit" disabled={createDebtMutation.isPending}>
              {createDebtMutation.isPending ? 'Saving...' : 'Create Debt'}
            </Button>
          </div>
        </form>
      </EditSheet>

      <EditSheet
        open={!!editingDebtId}
        onOpenChange={(open) => !open && setEditingDebtId(null)}
        title="Edit Friend Debt"
        description="Update amount or description."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const amt = parseFloat(editDebtDraft.amount)
            if (isNaN(amt) || amt === 0) return
            const txn = filteredPeerDebts.find((t: TransactionResponse) => t.id === editingDebtId)
            const signed = txn && txn.amount < 0 ? -Math.abs(amt) : Math.abs(amt)
            updateDebtMutation.mutate({
              id: editingDebtId!,
              amount: Math.round(signed * 100),
              description: editDebtDraft.description,
            })
          }}
        >
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Input
              value={editDebtDraft.description}
              onChange={e => setEditDebtDraft(d => ({ ...d, description: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Amount</Label>
            <p className="text-xs text-muted-foreground">Enter positive number. Sign (who owes whom) is preserved.</p>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={editDebtDraft.amount}
              onChange={e => setEditDebtDraft(d => ({ ...d, amount: e.target.value }))}
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setEditingDebtId(null)}>Cancel</Button>
            <Button type="submit" disabled={updateDebtMutation.isPending}>
              {updateDebtMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </EditSheet>
    </>
  )
}
