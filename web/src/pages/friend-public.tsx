import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoneyValue } from '@/components/ui/money-value'
import { fetchPublicFriend, togglePublicFriendGroupPayment, type PeerDebtResponse } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { copyToClipboard } from '@/lib/clipboard'
import { publicFriendRoute } from '@/router'
import { calculateNextPayDate } from '@/components/debt/debt-list-mappers'

function InstallmentCard({ debt }: { debt: PeerDebtResponse }) {
  const total = debt.total_installments ?? 1
  const paid = debt.paid_installments ?? 0
  const remaining = total - paid
  const absTotal = Math.abs(debt.amount)
  const perInstall = absTotal / total
  const remainingAmount = perInstall * remaining
  const nextDate = calculateNextPayDate(debt)
  const progressPct = total > 0 ? (paid / total) * 100 : 0

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{debt.description}</p>
        <Badge variant="secondary" className="shrink-0">{paid}/{total} paid</Badge>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct.toFixed(1)}%` }}
        />
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2.5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Next installment</p>
          {nextDate && (
            <p className="text-xs text-muted-foreground mt-0.5">Due {formatDate(nextDate)}</p>
          )}
        </div>
        <MoneyValue
          amount={perInstall}
          currency="BRL"
          showSign="never"
          tone="neutral"
          className="text-2xl font-bold tabular-nums"
        />
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{remaining} installment{remaining !== 1 ? 's' : ''} remaining</span>
        <MoneyValue
          amount={remainingAmount}
          currency="BRL"
          showSign="never"
          tone="neutral"
          className="font-medium text-foreground"
        />
      </div>
    </div>
  )
}

function PendingLumpSumRow({ debt }: { debt: PeerDebtResponse }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div>
        <p className="font-medium text-sm">{debt.description}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Since {formatDate(debt.anchor_date ?? debt.date)}</p>
      </div>
      <MoneyValue
        amount={Math.abs(debt.amount)}
        currency="BRL"
        showSign="never"
        tone="neutral"
        className="font-semibold tabular-nums shrink-0"
      />
    </div>
  )
}

export function FriendPublicPage() {
  const queryClient = useQueryClient()
  const { token } = publicFriendRoute.useParams()
  const [showHistory, setShowHistory] = useState(false)

  const confirmGroupPaymentMutation = useMutation({
    mutationFn: ({ eventId, friendId }: { eventId: string; friendId: string }) =>
      togglePublicFriendGroupPayment(token, eventId, friendId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-friend', token] })
      toast.success('Payment updated')
    },
    onError: () => toast.error('Failed to update payment'),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-friend', token],
    queryFn: () => fetchPublicFriend(token),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 flex flex-col gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <p className="font-semibold text-destructive">Balance not found</p>
          <p className="text-sm text-muted-foreground mt-2">This link may be invalid or the friend may have been removed.</p>
        </div>
      </div>
    )
  }

  const hostedGroups = data.hosted_groups ?? []
  const groups = data.groups ?? []

  const pendingOwedToFriend: PeerDebtResponse[] = data.debts.filter(
    d => d.amount < 0 && !d.is_confirmed && !(d.is_installment && (d.paid_installments ?? 0) >= (d.total_installments ?? 0))
  )
  const pendingOwedByFriend: PeerDebtResponse[] = data.debts.filter(
    d => d.amount > 0 && !d.is_confirmed
  )
  const settled: PeerDebtResponse[] = data.debts.filter(
    d => d.is_confirmed || (d.is_installment && (d.paid_installments ?? 0) >= (d.total_installments ?? 1))
  )

  const owedToFriend = data.balance.user_owes_friend
  const owedByFriend = data.balance.friend_owes_user
  const hasBalance = owedToFriend > 0 || owedByFriend > 0

  return (
    <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">

      {/* Balance hero */}
      <div className="rounded-xl border border-border/60 bg-card p-6 flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">{data.name}</p>

        {!hasBalance ? (
          <p className="text-lg font-semibold text-muted-foreground">All settled up.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {owedToFriend > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">You are owed</p>
                <MoneyValue
                  amount={owedToFriend}
                  currency="BRL"
                  showSign="never"
                  tone="positive"
                  className="text-4xl font-bold tabular-nums"
                />
              </div>
            )}
            {owedByFriend > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">You owe</p>
                <MoneyValue
                  amount={owedByFriend}
                  currency="BRL"
                  showSign="never"
                  tone="negative"
                  className="text-4xl font-bold tabular-nums"
                />
              </div>
            )}
          </div>
        )}

        {data.owner_pix_key && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={async () => {
              const ok = await copyToClipboard(data.owner_pix_key!)
              if (ok) toast.success('PIX key copied')
              else toast.error('Failed to copy PIX key')
            }}
          >
            <Copy size={14} />
            Copy PIX key to pay
          </Button>
        )}
      </div>

      {/* Pending: what the owner owes the friend */}
      {pendingOwedToFriend.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Pending payments</p>
          {pendingOwedToFriend.map(debt =>
            debt.is_installment ? (
              <InstallmentCard key={debt.id} debt={debt} />
            ) : (
              <PendingLumpSumRow key={debt.id} debt={debt} />
            )
          )}
        </section>
      )}

      {/* Pending: what the friend owes the owner */}
      {pendingOwedByFriend.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">You owe</p>
          {pendingOwedByFriend.map(debt => (
            <div key={debt.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
              <div>
                <p className="font-medium text-sm">{debt.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(debt.anchor_date ?? debt.date)}</p>
              </div>
              <MoneyValue amount={debt.amount} currency="BRL" showSign="never" tone="negative" className="font-semibold tabular-nums shrink-0" />
            </div>
          ))}
        </section>
      )}

      {/* Group participations */}
      {groups.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Group events</p>
          {groups.map(group => (
            <div key={group.event_id} className="rounded-xl border border-border/60 bg-card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{group.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(group.date)} · Host: {group.host_name}</p>
                </div>
                <MoneyValue amount={group.share_amount} currency="BRL" showSign="never" tone="neutral" className="font-semibold shrink-0" />
              </div>
              <div className="flex items-center justify-between">
                <Badge variant={group.is_confirmed ? 'default' : 'outline'}>
                  {group.is_confirmed ? 'Paid' : 'Pending payment to host'}
                </Badge>
                {group.host_pix_key && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const ok = await copyToClipboard(group.host_pix_key!)
                      if (ok) toast.success('Host PIX copied')
                      else toast.error('Failed to copy PIX key')
                    }}
                  >
                    <Copy size={13} />
                    Copy host PIX
                  </Button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Hosted groups — friend can confirm participants paid */}
      {hostedGroups.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Groups you host</p>
          {hostedGroups.map(group => (
            <div key={group.event_id} className="rounded-xl border border-border/60 bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{group.title}</p>
                <p className="text-xs text-muted-foreground">{formatDate(group.date)}</p>
              </div>
              {group.participants.length === 0 ? (
                <p className="text-xs text-muted-foreground">No participants to confirm.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border/40">
                  {group.participants.map(p => (
                    <div key={p.friend_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium">{p.friend_name}</p>
                        <MoneyValue amount={p.share_amount} currency="BRL" showSign="never" tone="neutral" className="text-xs text-muted-foreground" />
                      </div>
                      <Button
                        variant={p.is_confirmed ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => confirmGroupPaymentMutation.mutate({ eventId: group.event_id, friendId: p.friend_id })}
                        disabled={confirmGroupPaymentMutation.isPending}
                      >
                        <Check size={13} />
                        {p.is_confirmed ? 'Confirmed' : 'Confirm'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Settled history */}
      {settled.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            className="flex items-center justify-between px-1 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowHistory(v => !v)}
          >
            <span>History ({settled.length})</span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showHistory && (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
              {settled.map(debt => {
                const isInstallment = debt.is_installment && (debt.total_installments ?? 0) > 0
                const absTotal = Math.abs(debt.amount)
                return (
                  <div key={debt.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate text-muted-foreground">{debt.description}</p>
                      {isInstallment && (
                        <p className="text-xs text-muted-foreground/60">
                          {debt.paid_installments}/{debt.total_installments} installments paid
                        </p>
                      )}
                    </div>
                    <MoneyValue
                      amount={absTotal}
                      currency="BRL"
                      showSign="never"
                      tone="neutral"
                      className="text-sm tabular-nums text-muted-foreground shrink-0"
                    />
                    <Badge variant="default" className="text-[10px] shrink-0">Settled</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <p className="text-xs text-muted-foreground text-center pb-4">Read-only view shared by {data.name.split(' ')[0]}.</p>
    </div>
  )
}
