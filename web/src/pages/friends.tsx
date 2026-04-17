import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Check, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ValueInput } from '@/components/ui/value-input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { AppModal } from '@/components/AppModal'
import { CompactEntityTable } from '@/components/CompactEntityTable'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  listFriends,
  createFriend,
  updateFriend,
  deleteFriend,
  listPeerDebts,
  createPeerDebt,
  deletePeerDebt,
  confirmDebt,
  listGroupEvents,
  createGroupEvent,
  updateGroupEvent,
  deleteGroupEvent,
  getGroupEvent,
  setParticipants,
  type FriendResponse,
  type PeerDebtResponse,
  type GroupEventResponse,
} from '@/lib/api'
import { formatMoney, formatDate } from '@/lib/format'
import { AccountContext } from '@/App'

interface CreateFriendFormState {
  name: string
  notes: string
  pix_key: string
}

interface CreateEventFormState {
  title: string
  date: string
  total_amount: string
  notes: string
}

interface AddDebtFormState {
  description: string
  amount: string
  date: string
  is_installment: boolean
  total_installments: string
  frequency: 'weekly' | 'monthly'
}

const EMPTY_FRIEND_FORM: CreateFriendFormState = { name: '', notes: '', pix_key: '' }
const EMPTY_EVENT_FORM: CreateEventFormState = { title: '', date: '', total_amount: '', notes: '' }
const EMPTY_DEBT_FORM: AddDebtFormState = {
  description: '',
  amount: '',
  date: '',
  is_installment: false,
  total_installments: '',
  frequency: 'monthly',
}

function debtStatus(debt: PeerDebtResponse): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (debt.is_confirmed) return { label: 'Paid', variant: 'default' }
  if (debt.is_installment && debt.total_installments != null) {
    return { label: `${debt.paid_installments}/${debt.total_installments} paid`, variant: 'secondary' }
  }
  return { label: 'Unpaid', variant: 'outline' }
}

function calculateNextPayDate(debt: PeerDebtResponse): string | null {
  if (debt.is_confirmed) return null

  if (debt.is_installment && debt.anchor_date && debt.frequency && debt.total_installments) {
    const anchor = new Date(debt.anchor_date)
    const nextInstallmentNum = debt.paid_installments + 1

    if (nextInstallmentNum > debt.total_installments) return null

    let nextDate: Date
    if (debt.frequency === 'monthly') {
      nextDate = new Date(anchor)
      nextDate.setMonth(anchor.getMonth() + nextInstallmentNum - 1)
    } else if (debt.frequency === 'weekly') {
      nextDate = new Date(anchor)
      nextDate.setDate(anchor.getDate() + (nextInstallmentNum - 1) * 7)
    } else {
      return debt.date
    }

    return nextDate.toISOString().split('T')[0]
  }

  return debt.date
}

function getDisplayAmount(debt: PeerDebtResponse): number {
  if (debt.is_installment && debt.total_installments && debt.total_installments > 0) {
    const installmentAmount = debt.amount / debt.total_installments
    const remainingInstallments = debt.total_installments - debt.paid_installments
    return installmentAmount * remainingInstallments
  }
  return debt.amount
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    document.execCommand('copy')
    return true
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function FriendDetailsModal({
  friend,
  accountId,
  open,
  onOpenChange,
}: {
  friend: FriendResponse | null
  accountId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [nameDraft, setNameDraft] = useState('')
  const [pixKeyDraft, setPixKeyDraft] = useState('')
  const [showAddDebt, setShowAddDebt] = useState(false)
  const [debtForm, setDebtForm] = useState<AddDebtFormState>(EMPTY_DEBT_FORM)
  const [confirmDeleteFriendOpen, setConfirmDeleteFriendOpen] = useState(false)
  const [debtToDelete, setDebtToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (!friend) return
    setNameDraft(friend.name)
    setPixKeyDraft(friend.pix_key ?? '')
  }, [friend])

  const { data: debts = [], isLoading: debtsLoading } = useQuery({
    queryKey: ['peer-debts', accountId, friend?.id],
    queryFn: () => listPeerDebts(accountId!, friend!.id),
    enabled: open && !!friend && !!accountId,
  })

  const renameMutation = useMutation({
    mutationFn: () => updateFriend(friend!.id, { name: nameDraft.trim(), pix_key: pixKeyDraft.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      toast.success('Friend updated')
    },
    onError: () => toast.error('Failed to update friend'),
  })

  const deleteFriendMutation = useMutation({
    mutationFn: () => deleteFriend(friend!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['peer-debts-all', accountId] })
      toast.success('Friend deleted')
      onOpenChange(false)
    },
    onError: () => toast.error('Failed to delete friend'),
  })

  const addDebtMutation = useMutation({
    mutationFn: () =>
      createPeerDebt({
        account_id: accountId!,
        friend_id: friend!.id,
        description: debtForm.description,
        amount: Math.round(parseFloat(debtForm.amount.replace(',', '.')) * 100),
        date: debtForm.date,
        ...(debtForm.is_installment
          ? {
              is_installment: true,
              total_installments: parseInt(debtForm.total_installments, 10),
              frequency: debtForm.frequency,
            }
          : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peer-debts', accountId, friend?.id] })
      queryClient.invalidateQueries({ queryKey: ['peer-debts-all', accountId] })
      toast.success('Debt added')
      setDebtForm(EMPTY_DEBT_FORM)
      setShowAddDebt(false)
    },
    onError: () => toast.error('Failed to add debt'),
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peer-debts', accountId, friend?.id] })
      queryClient.invalidateQueries({ queryKey: ['peer-debts-all', accountId] })
      toast.success('Debt confirmed')
    },
    onError: () => toast.error('Failed to confirm debt'),
  })

  const deleteDebtMutation = useMutation({
    mutationFn: (id: string) => deletePeerDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peer-debts', accountId, friend?.id] })
      queryClient.invalidateQueries({ queryKey: ['peer-debts-all', accountId] })
      toast.success('Debt deleted')
      setDebtToDelete(null)
    },
    onError: () => toast.error('Failed to delete debt'),
  })

  function handleAddDebt(e: FormEvent) {
    e.preventDefault()
    if (!friend || !accountId) return

    const amount = parseFloat(debtForm.amount.replace(',', '.'))
    if (Number.isNaN(amount)) {
      toast.error('Enter valid amount')
      return
    }

    if (debtForm.is_installment) {
      const totalInstallments = parseInt(debtForm.total_installments, 10)
      if (Number.isNaN(totalInstallments) || totalInstallments <= 0) {
        toast.error('Enter valid installments')
        return
      }
    }

    addDebtMutation.mutate()
  }

  if (!friend) return null

  const debtTarget = debts.find(d => d.id === debtToDelete)

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Friend Details"
      description="Manage friend, debts, link access"
      contentClassName="sm:max-w-[calc(100vw-2rem)] lg:max-w-5xl"
    >

        <ConfirmDialog
          open={confirmDeleteFriendOpen}
          onCancel={() => setConfirmDeleteFriendOpen(false)}
          onConfirm={() => {
            setConfirmDeleteFriendOpen(false)
            deleteFriendMutation.mutate()
          }}
          title={`Delete "${friend.name}"?`}
          description="This removes friend and debt history."
          confirmLabel="Delete"
        />

        <ConfirmDialog
          open={!!debtToDelete}
          onCancel={() => setDebtToDelete(null)}
          onConfirm={() => {
            if (debtToDelete) deleteDebtMutation.mutate(debtToDelete)
          }}
          title={`Delete debt "${debtTarget?.description ?? ''}"?`}
          description="This action cannot be undone."
          confirmLabel="Delete"
        />

        <div className="flex flex-col gap-2">
          <Input
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            placeholder="Friend name"
          />
          <Input
            value={pixKeyDraft}
            onChange={e => setPixKeyDraft(e.target.value)}
            placeholder="PIX key (optional)"
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10"
              onClick={() => {
                if (!nameDraft.trim()) {
                  toast.error('Name required')
                  return
                }
                renameMutation.mutate()
              }}
              disabled={renameMutation.isPending}
              aria-label="Save friend"
            >
              <Save size={14} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10"
              onClick={() => setConfirmDeleteFriendOpen(true)}
              disabled={deleteFriendMutation.isPending}
              aria-label="Delete friend"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {debtsLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : debts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No debts recorded</div>
        ) : (
          <>
            <div className="sm:hidden flex flex-col gap-2">
              {debts.map((debt: PeerDebtResponse) => {
                const status = debtStatus(debt)
                const nextPayDate = calculateNextPayDate(debt)
                const displayAmount = getDisplayAmount(debt)

                return (
                  <div key={debt.id} className="border rounded-md p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{debt.description}</div>
                        <div className="text-sm text-muted-foreground">{nextPayDate ? formatDate(nextPayDate) : '-'}</div>
                      </div>
                      <div className={`font-semibold tabular-nums ${displayAmount < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {formatMoney(displayAmount)}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <div className="flex gap-2">
                        {!debt.is_confirmed && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirmMutation.mutate(debt.id)}
                            disabled={confirmMutation.isPending}
                            aria-label="Confirm debt"
                          >
                            <Check size={14} />
                            Confirm
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDebtToDelete(debt.id)}
                          disabled={deleteDebtMutation.isPending}
                          aria-label="Delete debt"
                        >
                          <Trash2 size={14} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="hidden sm:block border rounded-md overflow-x-auto">
              <table className="min-w-full w-max text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-right px-3 py-2 font-medium">Remaining</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {debts.map((debt: PeerDebtResponse) => {
                    const status = debtStatus(debt)
                    const nextPayDate = calculateNextPayDate(debt)
                    const displayAmount = getDisplayAmount(debt)

                    return (
                      <tr key={debt.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {nextPayDate ? formatDate(nextPayDate) : '-'}
                        </td>
                        <td className="px-3 py-2">{debt.description}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap ${
                            displayAmount < 0 ? 'text-red-500' : 'text-green-600'
                          }`}
                        >
                          {formatMoney(displayAmount)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-end">
                            {!debt.is_confirmed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmMutation.mutate(debt.id)}
                                disabled={confirmMutation.isPending}
                                aria-label="Confirm debt"
                              >
                                <Check size={14} />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDebtToDelete(debt.id)}
                              disabled={deleteDebtMutation.isPending}
                              aria-label="Delete debt"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {showAddDebt ? (
          <form onSubmit={handleAddDebt} className="border rounded-md p-3 space-y-3">
            <p className="text-sm font-semibold">Add Debt</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                required
                value={debtForm.description}
                onChange={e => setDebtForm({ ...debtForm, description: e.target.value })}
                placeholder="Description"
              />
              <ValueInput
                required
                value={debtForm.amount}
                onValueChange={value => setDebtForm({ ...debtForm, amount: value })}
                placeholder="Amount"
                allowNegative
              />
              <Input
                required
                type="date"
                value={debtForm.date}
                onChange={e => setDebtForm({ ...debtForm, date: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id={`debt-installment-${friend.id}`}
                checked={debtForm.is_installment}
                onCheckedChange={checked => setDebtForm({ ...debtForm, is_installment: checked })}
              />
              <Label htmlFor={`debt-installment-${friend.id}`} className="cursor-pointer">
                Paid in installments
              </Label>
            </div>

            {debtForm.is_installment && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  required
                  type="number"
                  min="1"
                  value={debtForm.total_installments}
                  onChange={e => setDebtForm({ ...debtForm, total_installments: e.target.value })}
                  placeholder="Total installments"
                />
                <Select
                  value={debtForm.frequency}
                  onValueChange={(value: 'weekly' | 'monthly') => setDebtForm({ ...debtForm, frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={addDebtMutation.isPending}>Add</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddDebt(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowAddDebt(true)}>
            <Plus size={14} />
            Add Debt
          </Button>
        )}
    </AppModal>
  )
}

function GroupEventDetailsModal({
  event,
  friends,
  open,
  onOpenChange,
}: {
  event: GroupEventResponse | null
  friends: FriendResponse[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [titleDraft, setTitleDraft] = useState('')
  const [confirmDeleteEventOpen, setConfirmDeleteEventOpen] = useState(false)
  const [participantsInput, setParticipantsInput] = useState('')
  const [showParticipantsInput, setShowParticipantsInput] = useState(false)
  const [highlightParticipantsInput, setHighlightParticipantsInput] = useState(false)
  const participantsInputRef = useRef<HTMLInputElement>(null)
  const [participantIds, setParticipantIds] = useState<Array<string | null>>([])
  const [hostFriendId, setHostFriendId] = useState<string | null>(null)
  const [participantConfirmedMap, setParticipantConfirmedMap] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    if (event) setTitleDraft(event.title)
  }, [event])

  const { data: eventDetail, isLoading } = useQuery({
    queryKey: ['group-event', event?.id],
    queryFn: () => getGroupEvent(event!.id),
    enabled: open && !!event,
  })

  useEffect(() => {
    if (!open || !event) return

    const base = eventDetail?.participants?.map(p => p.friend_id) ?? []
    const deduped: Array<string | null> = [null]

    for (const id of base) {
      if (id !== null && !deduped.includes(id)) {
        deduped.push(id)
      }
    }

    setParticipantIds(deduped)
    setHostFriendId(eventDetail?.host_friend_id ?? null)
    setParticipantsInput('')
    setShowParticipantsInput(false)
    setHighlightParticipantsInput(false)

    const map = new Map<string, boolean>()
    for (const p of eventDetail?.participants ?? []) {
      map.set(p.friend_id ?? '__owner__', p.is_confirmed)
    }
    setParticipantConfirmedMap(map)
  }, [open, event, eventDetail])

  useEffect(() => {
    if (!showParticipantsInput) return

    participantsInputRef.current?.focus()
    participantsInputRef.current?.select()

    setHighlightParticipantsInput(true)
    const timer = window.setTimeout(() => setHighlightParticipantsInput(false), 1200)
    return () => window.clearTimeout(timer)
  }, [showParticipantsInput])

  const renameMutation = useMutation({
    mutationFn: () => updateGroupEvent(event!.id, { title: titleDraft.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events'] })
      queryClient.invalidateQueries({ queryKey: ['group-event', event?.id] })
      toast.success('Group event updated')
    },
    onError: () => toast.error('Failed to update group event'),
  })

  const deleteEventMutation = useMutation({
    mutationFn: () => deleteGroupEvent(event!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events'] })
      toast.success('Group event deleted')
      onOpenChange(false)
    },
    onError: () => toast.error('Failed to delete group event'),
  })

  const saveParticipantsMutation = useMutation({
    mutationFn: ({ ids, host, statusMap }: { ids: Array<string | null>; host: string | null; statusMap: Map<string, boolean> }) => {
      const count = ids.length || 1
      const share = event!.total_amount / count
      return setParticipants(event!.id, {
        host_friend_id: host,
        participants: ids.map(friend_id => ({
          friend_id,
          share_amount: share,
          is_confirmed: statusMap.get(friend_id ?? '__owner__') ?? false,
        })),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-event', event?.id] })
      queryClient.invalidateQueries({ queryKey: ['group-events'] })
      toast.success('Participants updated')
    },
    onError: () => toast.error('Failed to update participants'),
  })

  const participantLabel = (friendId: string | null) => {
    if (friendId === null) return 'You (admin)'
    const friend = friends.find(f => f.id === friendId)
    return friend?.name ?? `${friendId.slice(0, 8)}...`
  }

  const equalShare = useMemo(() => {
    if (!event || participantIds.length === 0) return 0
    return event.total_amount / participantIds.length
  }, [event, participantIds])

  function findFriendByToken(rawToken: string): { id: string | null; error?: string } {
    const token = rawToken.trim().toLowerCase()
    if (!token) return { id: null, error: 'empty' }

    const exact = friends.filter(f => f.name.toLowerCase() === token)
    if (exact.length === 1) return { id: exact[0].id }

    const starts = friends.filter(f => f.name.toLowerCase().startsWith(token))
    if (starts.length === 1) return { id: starts[0].id }
    if (starts.length > 1) return { id: null, error: `ambiguous: ${rawToken}` }

    const includes = friends.filter(f => f.name.toLowerCase().includes(token))
    if (includes.length === 1) return { id: includes[0].id }
    if (includes.length > 1) return { id: null, error: `ambiguous: ${rawToken}` }

    return { id: null, error: `not found: ${rawToken}` }
  }

  function persistParticipants(next: Array<string | null>, nextStatusMap: Map<string, boolean> = participantConfirmedMap, nextHost: string | null = hostFriendId) {
    const enforced = next.includes(null) ? next : [null, ...next]
    const enforcedStatus = new Map(nextStatusMap)
    if (!enforcedStatus.has('__owner__')) enforcedStatus.set('__owner__', false)

    setParticipantIds(enforced)
    setParticipantConfirmedMap(enforcedStatus)
    setHostFriendId(nextHost)
    saveParticipantsMutation.mutate({ ids: enforced, statusMap: enforcedStatus, host: nextHost })
  }

  async function addParticipantsFromInput(closeAfter = false) {
    const raw = participantsInput.trim()

    if (!raw) {
      if (closeAfter) setShowParticipantsInput(false)
      return
    }
    const tokens = raw
      .split(/[,:;]+/)
      .map(t => t.trim())
      .filter(Boolean)

    if (tokens.length === 0) {
      if (closeAfter) setShowParticipantsInput(false)
      return
    }

    const seen = new Set<string>()
    const uniqueTokens: string[] = []
    for (const token of tokens) {
      const key = token.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      uniqueTokens.push(token)
    }

    const next = [...participantIds]
    const nextStatus = new Map(participantConfirmedMap)
    const errors: string[] = []
    let changed = false

    for (const token of uniqueTokens) {
      const res = findFriendByToken(token)

      if (res.id) {
        if (!next.includes(res.id)) {
          next.push(res.id)
          nextStatus.set(res.id, false)
          changed = true
        }
        continue
      }

      if (res.error?.startsWith('not found:')) {
        try {
          const created = await createFriend({ name: token })
          void queryClient.invalidateQueries({ queryKey: ['friends'] })
          if (!next.includes(created.id)) {
            next.push(created.id)
            nextStatus.set(created.id, false)
            changed = true
          }
        } catch {
          errors.push(`create failed: ${token}`)
        }
        continue
      }

      if (res.error && res.error !== 'empty') errors.push(res.error)
    }

    setParticipantsInput('')
    if (changed) persistParticipants(next, nextStatus, hostFriendId)
    if (errors.length > 0) toast.error(errors.join(' | '))
    if (closeAfter) setShowParticipantsInput(false)
  }

  function removeParticipant(friendId: string | null) {
    if (friendId === null) {
      toast.error('You (admin) must always stay in participants')
      return
    }
    const next = participantIds.filter(id => id !== friendId)
    const nextStatus = new Map(participantConfirmedMap)
    nextStatus.delete(friendId)
    const nextHost = hostFriendId === friendId ? null : hostFriendId
    persistParticipants(next, nextStatus, nextHost)
  }

  function toggleParticipantConfirmed(friendId: string | null) {
    const key = friendId ?? '__owner__'
    const nextStatus = new Map(participantConfirmedMap)
    nextStatus.set(key, !(nextStatus.get(key) ?? false))
    persistParticipants(participantIds, nextStatus, hostFriendId)
  }

  if (!event) return null

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Group Event Details"
      description="Manage event, participants, link access"
      contentClassName="sm:max-w-[calc(100vw-2rem)] lg:max-w-5xl"
    >

        <ConfirmDialog
          open={confirmDeleteEventOpen}
          onCancel={() => setConfirmDeleteEventOpen(false)}
          onConfirm={() => {
            setConfirmDeleteEventOpen(false)
            deleteEventMutation.mutate()
          }}
          title={`Delete "${event.title}"?`}
          description="This removes all participants."
          confirmLabel="Delete"
        />

        <div className="flex gap-2 items-center">
          <Input
            className="flex-1"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            placeholder="Group event name"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10"
            onClick={() => {
              if (!titleDraft.trim()) {
                toast.error('Title required')
                return
              }
              renameMutation.mutate()
            }}
            disabled={renameMutation.isPending}
            aria-label="Save event"
          >
            <Save size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10"
            onClick={() => setConfirmDeleteEventOpen(true)}
            disabled={deleteEventMutation.isPending}
            aria-label="Delete event"
          >
            <Trash2 size={14} />
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          {formatDate(event.date)} · {formatMoney(event.total_amount)}
        </div>

        <div className="flex gap-2 items-center">
          {showParticipantsInput ? (
            <Input
              ref={participantsInputRef}
              value={participantsInput}
              onChange={e => setParticipantsInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addParticipantsFromInput(true)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setShowParticipantsInput(false)
                  setParticipantsInput('')
                  setHighlightParticipantsInput(false)
                }
              }}
              placeholder="Add participants: lin, Mari, Amanda"
              className={highlightParticipantsInput ? 'border-primary ring-2 ring-primary/30' : undefined}
              disabled={saveParticipantsMutation.isPending}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowParticipantsInput(true)
                setHighlightParticipantsInput(true)
              }}
              disabled={saveParticipantsMutation.isPending}
            >
              <Plus size={14} />
              Add participants
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">Host</Label>
          <Select
            value={hostFriendId ?? '__owner__'}
            onValueChange={(value) => {
              const nextHost = value === '__owner__' ? null : value
              persistParticipants(participantIds, participantConfirmedMap, nextHost)
            }}
          >
            <SelectTrigger className="w-full h-10">
              <SelectValue placeholder="Select host" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__owner__">You (admin)</SelectItem>
              {participantIds.filter((id): id is string => id !== null).map(id => (
                <SelectItem key={id} value={id}>{participantLabel(id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : participantIds.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No participants set</div>
        ) : (
          <>
            <div className="sm:hidden flex flex-col gap-2">
              {participantIds.map((friendId, i) => (
                <div key={`${event.id}-${friendId ?? 'host'}-${i}`} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-1 font-medium">
                      {participantLabel(friendId)}
                      {((hostFriendId === null && friendId === null) || (hostFriendId !== null && friendId === hostFriendId)) && (
                        <Badge variant="secondary">Host</Badge>
                      )}
                    </div>
                    <span className="tabular-nums font-semibold">{formatMoney(equalShare)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant={(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'default' : 'outline'}>
                      {(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'Confirmed' : 'Pending'}
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleParticipantConfirmed(friendId)}
                        aria-label="Toggle payment confirmation"
                      >
                        <Check size={14} />
                        Toggle
                      </Button>
                      {friendId !== null && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeParticipant(friendId)}
                          aria-label="Remove participant"
                        >
                          <X size={14} />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block border rounded-md overflow-x-auto">
              <table className="min-w-full w-max text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Participant</th>
                    <th className="text-right px-3 py-2 font-medium">Share</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {participantIds.map((friendId, i) => (
                    <tr key={`${event.id}-${friendId ?? 'host'}-${i}`} className="hover:bg-muted/30">
                      <td className="px-3 py-2 inline-flex items-center gap-1">
                        {participantLabel(friendId)}
                        {((hostFriendId === null && friendId === null) || (hostFriendId !== null && friendId === hostFriendId)) && (
                          <Badge variant="secondary">Host</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatMoney(equalShare)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'default' : 'outline'}>
                          {(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'Confirmed' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => toggleParticipantConfirmed(friendId)}
                            aria-label="Toggle payment confirmation"
                          >
                            <Check size={14} />
                          </Button>
                          {friendId !== null && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => removeParticipant(friendId)}
                              aria-label="Remove participant"
                            >
                              <X size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </AppModal>
  )
}

export function FriendsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId } = useContext(AccountContext)

  const [showCreateFriend, setShowCreateFriend] = useState(false)
  const [friendForm, setFriendForm] = useState<CreateFriendFormState>(EMPTY_FRIEND_FORM)

  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [eventForm, setEventForm] = useState<CreateEventFormState>(EMPTY_EVENT_FORM)

  const [activeFriendId, setActiveFriendId] = useState<string | null>(null)
  const [activeEventId, setActiveEventId] = useState<string | null>(null)

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: listFriends,
  })

  const { data: groupEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['group-events', selectedAccountId],
    queryFn: () => listGroupEvents(selectedAccountId!),
    enabled: !!selectedAccountId,
  })

  const { data: allDebts = [] } = useQuery({
    queryKey: ['peer-debts-all', selectedAccountId],
    queryFn: () => listPeerDebts(selectedAccountId!),
    enabled: !!selectedAccountId,
  })

  const friendOverview = useMemo(() => {
    const map = new Map<string, { total: number; openCount: number }>()

    for (const debt of allDebts) {
      const current = map.get(debt.friend_id) ?? { total: 0, openCount: 0 }
      const displayAmount = getDisplayAmount(debt)
      current.total += displayAmount
      if (!debt.is_confirmed) current.openCount += 1
      map.set(debt.friend_id, current)
    }

    return map
  }, [allDebts])

  const createFriendMutation = useMutation({
    mutationFn: () =>
      createFriend({
        name: friendForm.name,
        ...(friendForm.notes ? { notes: friendForm.notes } : {}),
        ...(friendForm.pix_key ? { pix_key: friendForm.pix_key } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      toast.success('Friend added')
      setFriendForm(EMPTY_FRIEND_FORM)
      setShowCreateFriend(false)
    },
    onError: () => toast.error('Failed to add friend'),
  })

  const createEventMutation = useMutation({
    mutationFn: () =>
      createGroupEvent({
        account_id: selectedAccountId!,
        title: eventForm.title,
        date: eventForm.date,
        total_amount: parseFloat(eventForm.total_amount.replace(',', '.')),
        ...(eventForm.notes ? { notes: eventForm.notes } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events'] })
      toast.success('Group event created')
      setEventForm(EMPTY_EVENT_FORM)
      setShowCreateEvent(false)
    },
    onError: () => toast.error('Failed to create group event'),
  })

  const activeFriend = friends.find(f => f.id === activeFriendId) ?? null
  const activeEvent = groupEvents.find(e => e.id === activeEventId) ?? null

  function handleCreateEvent(e: FormEvent) {
    e.preventDefault()

    const totalAmount = parseFloat(eventForm.total_amount.replace(',', '.'))
    if (Number.isNaN(totalAmount)) {
      toast.error('Please enter a valid total amount')
      return
    }

    if (!selectedAccountId) {
      toast.error('Select an account first')
      return
    }

    createEventMutation.mutate()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Friends</h1>
          <Button size="sm" onClick={() => setShowCreateFriend(true)}>
            <Plus size={16} />
            Add Friend
          </Button>
        </div>

        {friendsLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-semibold">No friends yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add friend to track debts.</p>
          </div>
        ) : (
          <CompactEntityTable
            entityLabel="Friend"
            items={friends.map(friend => {
              const overview = friendOverview.get(friend.id) ?? { total: 0, openCount: 0 }

              return {
                id: friend.id,
                primary: friend.name,
                secondary: `${overview.openCount} open · ${formatMoney(overview.total)} total`,
                onCopy: async () => {
                  const ok = await copyToClipboard(`${window.location.origin}/public/friend/${friend.public_token}`)
                  if (ok) toast.success('Link copied')
                  else toast.error('Failed to copy link')
                },
                onOpen: () => setActiveFriendId(friend.id),
                copyAriaLabel: 'Copy public link',
                openAriaLabel: 'Access friend details',
              }
            })}
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Group Events</h2>
          <Button size="sm" onClick={() => setShowCreateEvent(true)}>
            <Plus size={16} />
            New Event
          </Button>
        </div>


        {eventsLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : groupEvents.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-semibold">No group events yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create event to split costs.</p>
          </div>
        ) : (
          <CompactEntityTable
            entityLabel="Event"
            items={groupEvents.map(event => ({
              id: event.id,
              primary: event.title,
              secondary: `${formatDate(event.date)} · ${formatMoney(event.total_amount)}`,
              onCopy: async () => {
                const ok = await copyToClipboard(`${window.location.origin}/public/group/${event.public_token}`)
                if (ok) toast.success('Link copied')
                else toast.error('Failed to copy link')
              },
              onOpen: () => setActiveEventId(event.id),
              copyAriaLabel: 'Copy public link',
              openAriaLabel: 'Access group event details',
            }))}
          />
        )}
      </section>

      <AppModal
        open={showCreateEvent}
        onOpenChange={(open) => {
          setShowCreateEvent(open)
          if (!open) setEventForm(EMPTY_EVENT_FORM)
        }}
        title="New Group Event"
        description="Create event to split costs with friends."
      >
        <form onSubmit={handleCreateEvent} className="flex flex-col gap-4">
          <div>
            <Label className="block text-sm font-medium mb-1">Title</Label>
            <Input
              required
              value={eventForm.title}
              onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
              placeholder="Pizza Night"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="block text-sm font-medium mb-1">Date</Label>
              <Input
                type="date"
                required
                value={eventForm.date}
                onChange={e => setEventForm({ ...eventForm, date: e.target.value })}
              />
            </div>
            <div>
              <Label className="block text-sm font-medium mb-1">Total Amount ($)</Label>
              <ValueInput
                required
                value={eventForm.total_amount}
                onValueChange={value => setEventForm({ ...eventForm, total_amount: value })}
                placeholder="0.00"
                allowNegative={false}
              />
            </div>
          </div>
          <div>
            <Label className="block text-sm font-medium mb-1">Notes (optional)</Label>
            <Textarea
              rows={2}
              value={eventForm.notes}
              onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
              placeholder="Optional notes"
              className="resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createEventMutation.isPending}>Create Event</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateEvent(false)
                setEventForm(EMPTY_EVENT_FORM)
              }}
            >
              Discard
            </Button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={showCreateFriend}
        onOpenChange={(open) => {
          setShowCreateFriend(open)
          if (!open) setFriendForm(EMPTY_FRIEND_FORM)
        }}
        title="New Friend"
        description="Create friend to track debts and share link."
      >
        <form
          onSubmit={e => {
            e.preventDefault()
            createFriendMutation.mutate()
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <Label className="block text-sm font-medium mb-1">Name</Label>
            <Input
              required
              value={friendForm.name}
              onChange={e => setFriendForm({ ...friendForm, name: e.target.value })}
              placeholder="Alice"
            />
          </div>
          <div>
            <Label className="block text-sm font-medium mb-1">Notes (optional)</Label>
            <Textarea
              rows={2}
              value={friendForm.notes}
              onChange={e => setFriendForm({ ...friendForm, notes: e.target.value })}
              placeholder="Optional notes"
              className="resize-none"
            />
          </div>
          <div>
            <Label className="block text-sm font-medium mb-1">PIX key (optional)</Label>
            <Input
              value={friendForm.pix_key}
              onChange={e => setFriendForm({ ...friendForm, pix_key: e.target.value })}
              placeholder="CPF, phone, email, random key"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createFriendMutation.isPending}>Create Friend</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateFriend(false)
                setFriendForm(EMPTY_FRIEND_FORM)
              }}
            >
              Discard
            </Button>
          </div>
        </form>
      </AppModal>

      <FriendDetailsModal
        friend={activeFriend}
        accountId={selectedAccountId}
        open={!!activeFriend}
        onOpenChange={(open) => {
          if (!open) setActiveFriendId(null)
        }}
      />

      <GroupEventDetailsModal
        event={activeEvent}
        friends={friends}
        open={!!activeEvent}
        onOpenChange={(open) => {
          if (!open) setActiveEventId(null)
        }}
      />

      <div className="h-24 sm:h-8" />


    </div>
  )
}
