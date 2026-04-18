import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchPublicFriend, togglePublicFriendGroupPayment, type PeerDebtResponse, type PublicFriendGroupResponse } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { MoneyValue } from '@/components/ui/money-value'
import { copyToClipboard } from '@/lib/clipboard'
import { publicFriendRoute } from '@/router'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import { mapPublicDebtsToVM } from '@/components/debt/debt-list-mappers'
import { ChevronDown, ChevronUp, Check, Copy } from 'lucide-react'

// Generate mock payment history for a debt
function generatePaymentHistory(debt: PeerDebtResponse): Array<{ date: string; amount: number }> {
  if (!debt.is_installment || debt.paid_installments === 0) return []
  
  const history: Array<{ date: string; amount: number }> = []
  const installmentAmount = debt.amount / (debt.total_installments || 1)
  const anchor = debt.anchor_date ? new Date(debt.anchor_date) : new Date(debt.date)
  
  for (let i = 0; i < debt.paid_installments; i++) {
    let payDate: Date
    if (debt.frequency === 'monthly') {
      payDate = new Date(anchor)
      payDate.setMonth(anchor.getMonth() + i)
    } else if (debt.frequency === 'weekly') {
      payDate = new Date(anchor)
      payDate.setDate(anchor.getDate() + i * 7)
    } else {
      payDate = new Date(anchor)
      payDate.setMonth(anchor.getMonth() + i)
    }
    
    history.push({
      date: payDate.toISOString().split('T')[0],
      amount: installmentAmount,
    })
  }
  
  return history
}

function groupStatus(group: PublicFriendGroupResponse): { label: string; variant: 'default' | 'outline' } {
  if (group.is_confirmed) return { label: 'Paid', variant: 'default' }
  return { label: 'Pending payment to host', variant: 'outline' }
}

export function FriendPublicPage() {
  const queryClient = useQueryClient()
  const { token } = publicFriendRoute.useParams()
  const [showPaymentHistory, setShowPaymentHistory] = useState(false)

  const confirmGroupPaymentMutation = useMutation({
    mutationFn: ({ eventId, friendId }: { eventId: string; friendId: string }) => togglePublicFriendGroupPayment(token, eventId, friendId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-friend', token] })
      toast.success('Group payment updated')
    },
    onError: () => toast.error('Failed to update group payment'),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-friend', token],
    queryFn: () => fetchPublicFriend(token),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 flex flex-col gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-semibold text-destructive">Balance not found</p>
            <p className="text-sm text-muted-foreground mt-2">
              This link may be invalid or the friend may have been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const groups = data.groups ?? []
  const hostedGroups = data.hosted_groups ?? []
  const pendingGroupTotal = groups
    .filter(g => !g.is_confirmed)
    .reduce((sum, g) => sum + g.share_amount, 0)

  // Calculate total from remaining amounts (exclude fully paid debts)
  const totalAmount = data.debts.reduce((sum, debt) => {
    if (debt.is_confirmed) return sum

    if (debt.is_installment && debt.total_installments && debt.total_installments > 0) {
      const installmentAmount = debt.amount / debt.total_installments
      const remainingInstallments = debt.total_installments - debt.paid_installments
      return sum + (installmentAmount * remainingInstallments)
    }

    return sum + debt.amount
  }, 0)

  return (
    <div className="max-w-xl mx-auto px-4 py-12 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{data.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Group Participations</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No group events yet</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingGroupTotal > 0 && (
                <p className="text-sm">
                  You still need to pay the host{groups[0]?.host_name ? ` (${groups[0].host_name})` : ''}:{' '}
                  <MoneyValue amount={pendingGroupTotal} currency="BRL" showSign="never" tone="neutral" className="font-semibold" />                </p>
              )}
              <div className="sm:hidden flex flex-col gap-2">
                {groups.map(group => {
                  const status = groupStatus(group)
                  return (
                    <div key={group.event_id} className="border rounded-md p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{group.title}</div>
                          <div className="text-sm text-muted-foreground">{formatDate(group.date)} · {group.host_name}</div>
                        </div>
                        <MoneyValue amount={group.share_amount} currency="BRL" showSign="never" tone="neutral" className="font-semibold" />                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {group.host_pix_key && (
                          <Button
                            variant="outline"
                            className="h-9"
                            onClick={async () => {
                              const ok = await copyToClipboard(group.host_pix_key!)
                              if (ok) toast.success('Host PIX copied')
                              else toast.error('Failed to copy PIX key')
                            }}
                          >
                            <Copy size={14} />
                            Copy PIX
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b border-border/40">
                      <th className="text-left pb-2 pr-3">Group</th>
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Host</th>
                      <th className="text-right pb-2 pr-3">Your Share</th>
                      <th className="text-left pb-2 pr-3">Status</th>
                      <th className="text-right pb-2">PIX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(group => {
                      const status = groupStatus(group)
                      return (
                        <tr key={group.event_id} className="border-b border-border/20 last:border-0">
                          <td className="py-2 pr-3">{group.title}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDate(group.date)}</td>
                          <td className="py-2 pr-3 whitespace-nowrap inline-flex items-center gap-1">
                            {group.host_name}
                            <Badge variant="secondary">Host</Badge>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            <MoneyValue amount={group.share_amount} currency="BRL" showSign="never" tone="neutral" />
                          </td>                          <td className="py-2 pr-3">
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </td>
                          <td className="py-2 text-right">
                            {group.host_pix_key && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={async () => {
                                  const ok = await copyToClipboard(group.host_pix_key!)
                                  if (ok) toast.success('Host PIX copied')
                                  else toast.error('Failed to copy PIX key')
                                }}
                                aria-label="Copy host PIX"
                              >
                                <Copy size={14} />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {hostedGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hosted Groups · Confirm Payments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {hostedGroups.map(group => (
              <div key={group.event_id} className="border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{group.title}</p>
                  <span className="text-xs text-muted-foreground">{formatDate(group.date)}</span>
                </div>
                {group.participants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No participants to confirm.</p>
                ) : (
                  <>
                    <div className="sm:hidden flex flex-col gap-2">
                      {group.participants.map(p => (
                        <div key={p.friend_id} className="border rounded-md p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium">{p.friend_name}</div>
                            <MoneyValue amount={p.share_amount} currency="BRL" showSign="never" tone="neutral" />                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <Badge variant={p.is_confirmed ? 'default' : 'outline'}>
                              {p.is_confirmed ? 'Confirmed' : 'Pending'}
                            </Badge>
                            <Button
                              variant="outline"
                              className="h-9"
                              onClick={() => confirmGroupPaymentMutation.mutate({ eventId: group.event_id, friendId: p.friend_id })}
                              disabled={confirmGroupPaymentMutation.isPending}
                            >
                              <Check size={14} />
                              {p.is_confirmed ? 'Undo' : 'Confirm'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <table className="hidden sm:table w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground text-xs border-b border-border/40">
                          <th className="text-left pb-1 pr-2">Participant</th>
                          <th className="text-right pb-1 pr-2">Share</th>
                          <th className="text-left pb-1 pr-2">Status</th>
                          <th className="text-right pb-1">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.participants.map(p => (
                          <tr key={p.friend_id} className="border-b border-border/20 last:border-0">
                            <td className="py-1 pr-2">{p.friend_name}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">
                              <MoneyValue amount={p.share_amount} currency="BRL" showSign="never" tone="neutral" />
                            </td>                            <td className="py-1 pr-2">
                              <Badge variant={p.is_confirmed ? 'default' : 'outline'}>
                                {p.is_confirmed ? 'Confirmed' : 'Pending'}
                              </Badge>
                            </td>
                            <td className="py-1 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => confirmGroupPaymentMutation.mutate({ eventId: group.event_id, friendId: p.friend_id })}
                                disabled={confirmGroupPaymentMutation.isPending}
                                aria-label="Toggle participant payment"
                              >
                                <Check size={14} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debt History</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SharedDebtList
            view="public-friend"
            items={mapPublicDebtsToVM(data.debts)}
            emptyTitle="No debts recorded"
            emptyHint="Nothing pending right now"
          />
          <div className="flex items-center justify-between border-t border-border/60 pt-2 mt-1">
            <span className="font-semibold">Total</span>
            <MoneyValue amount={totalAmount} currency="BRL" showSign="auto" tone="auto" className="font-semibold" />
          </div>
        </CardContent>
      </Card>

      {/* Hidden Payment History */}
      {data.debts.some(d => d.is_installment && d.paid_installments > 0) && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowPaymentHistory(!showPaymentHistory)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Payment History</CardTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">{showPaymentHistory ? 'Hide' : 'Show'}</span>
                {showPaymentHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
          </CardHeader>
          {showPaymentHistory && (
            <CardContent>
              {data.debts
                .filter(d => d.is_installment && d.paid_installments > 0)
                .map(debt => {
                  const payments = generatePaymentHistory(debt)
                  return (
                    <div key={debt.id} className="mb-4 last:mb-0">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {debt.description}
                      </p>
                      <table className="w-full text-sm mb-4">
                        <thead className="text-muted-foreground text-xs">
                          <tr className="border-b border-border/20">
                            <th className="text-left pb-1 pr-3">Payment Date</th>
                            <th className="text-right pb-1">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((payment, idx) => (
                            <tr key={idx} className="border-b border-border/10 last:border-0">
                              <td className="py-1 pr-3">{formatDate(payment.date)}</td>
                              <td className="py-1 text-right tabular-nums">
                                <MoneyValue amount={payment.amount} currency="BRL" showSign="never" tone="neutral" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
            </CardContent>
          )}
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">This is a read-only view.</p>
    </div>
  )
}
