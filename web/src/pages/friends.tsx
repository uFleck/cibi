import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  listFriends,
  createFriend,
  deleteFriend,
  listPeerDebts,
  createPeerDebt,
  confirmDebt,
  listGroupEvents,
  createGroupEvent,
  getGroupEvent,
  setParticipants,
  type FriendResponse,
  type PeerDebtResponse,
  type GroupEventResponse,
} from '@/lib/api'
import { formatMoney, formatDate } from '@/lib/format'

// ─── Friend Card ──────────────────────────────────────────────────────────

interface AddDebtFormState {
  description: string
  amount: string
  date: string
  is_installment: boolean
  total_installments: string
  frequency: string
}

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

function FriendCard({ friend }: { friend: FriendResponse }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [showAddDebt, setShowAddDebt] = useState(false)
  const [debtForm, setDebtForm] = useState<AddDebtFormState>(EMPTY_DEBT_FORM)

  const { data: debts = [], isLoading: debtsLoading } = useQuery({
    queryKey: ['peer-debts', friend.id],
    queryFn: () => listPeerDebts(friend.id),
    enabled: expanded,
  })

  const deleteFriendMutation = useMutation({
    mutationFn: () => deleteFriend(friend.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      toast.success('Friend removed')
    },
    onError: () => toast.error('Failed to remove friend'),
  })

  const addDebtMutation = useMutation({
    mutationFn: () =>
      createPeerDebt({
        friend_id: friend.id,
        amount: parseFloat(debtForm.amount),
        description: debtForm.description,
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
      queryClient.invalidateQueries({ queryKey: ['peer-debts', friend.id] })
      queryClient.invalidateQueries({ queryKey: ['friend-summary'] })
      toast.success('Debt added')
      setDebtForm(EMPTY_DEBT_FORM)
      setShowAddDebt(false)
    },
    onError: () => toast.error('Failed to add debt'),
  })

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peer-debts', friend.id] })
      queryClient.invalidateQueries({ queryKey: ['friend-summary'] })
      toast.success('Debt confirmed')
    },
    onError: () => toast.error('Failed to confirm debt'),
  })

  function copyLink() {
    const url = `${window.location.origin}/public/friend/${friend.public_token}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied!'),
      () => toast.error('Failed to copy link'),
    )
  }

  function handleDelete() {
    if (!window.confirm(`Remove ${friend.name}? This will delete all their debt history.`)) return
    deleteFriendMutation.mutate()
  }

  function handleAddDebt(e: React.FormEvent) {
    e.preventDefault()
    addDebtMutation.mutate()
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-left font-semibold hover:text-foreground/80 transition-colors"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {friend.name}
          </button>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={copyLink} aria-label="Copy public link">
              <Copy size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} aria-label="Delete friend">
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 flex flex-col gap-4">
            {debtsLoading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : debts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No debts recorded</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b border-border/40">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Description</th>
                      <th className="text-right pb-2 pr-3">Amount</th>
                      <th className="text-left pb-2 pr-3">Status</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {debts.map((debt: PeerDebtResponse) => {
                      const status = debtStatus(debt)
                      return (
                        <tr key={debt.id} className="border-b border-border/20 last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDate(debt.date)}</td>
                          <td className="py-2 pr-3">{debt.description}</td>
                          <td
                            className={`py-2 pr-3 text-right tabular-nums ${
                              debt.amount < 0 ? 'text-red-500' : 'text-green-600'
                            }`}
                          >
                            {formatMoney(debt.amount)}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </td>
                          <td className="py-2">
                            {!debt.is_confirmed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmMutation.mutate(debt.id)}
                                disabled={confirmMutation.isPending}
                              >
                                Confirm
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {showAddDebt ? (
              <form onSubmit={handleAddDebt} className="flex flex-col gap-3 border border-border/40 rounded-lg p-4">
                <p className="text-xs font-semibold">Add Debt</p>
                <div>
                  <label className="block text-xs font-medium mb-1">Description</label>
                  <Input
                    required
                    value={debtForm.description}
                    onChange={e => setDebtForm({ ...debtForm, description: e.target.value })}
                    placeholder="e.g. Dinner at Zaza's"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Amount ($) — positive = they owe you, negative = you owe them
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={debtForm.amount}
                    onChange={e => setDebtForm({ ...debtForm, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <Input
                    type="date"
                    required
                    value={debtForm.date}
                    onChange={e => setDebtForm({ ...debtForm, date: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`installment-${friend.id}`}
                    checked={debtForm.is_installment}
                    onChange={e => setDebtForm({ ...debtForm, is_installment: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor={`installment-${friend.id}`} className="text-xs">
                    Paid in installments
                  </label>
                </div>
                {debtForm.is_installment && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-1">Total Installments</label>
                      <Input
                        type="number"
                        min="1"
                        required
                        value={debtForm.total_installments}
                        onChange={e => setDebtForm({ ...debtForm, total_installments: e.target.value })}
                        placeholder="12"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Frequency</label>
                      <select
                        className="w-full h-8 px-2 py-1 rounded-lg border border-input bg-transparent text-base md:text-sm"
                        value={debtForm.frequency}
                        onChange={e => setDebtForm({ ...debtForm, frequency: e.target.value })}
                      >
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={addDebtMutation.isPending}>
                    Add Debt
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddDebt(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setShowAddDebt(true)}
              >
                <Plus size={14} /> Add Debt
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Group Event Card ─────────────────────────────────────────────────────

interface ParticipantRow {
  friend_id: string | null
  share_amount: string
}

function GroupEventCard({ event, friends }: { event: GroupEventResponse; friends: FriendResponse[] }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editingParticipants, setEditingParticipants] = useState(false)
  const [participantRows, setParticipantRows] = useState<ParticipantRow[]>([])

  const { data: eventDetail } = useQuery({
    queryKey: ['group-event', event.id],
    queryFn: () => getGroupEvent(event.id),
    enabled: expanded,
  })

  const setParticipantsMutation = useMutation({
    mutationFn: () =>
      setParticipants(event.id, {
        participants: participantRows.map(r => ({
          friend_id: r.friend_id,
          share_amount: parseFloat(r.share_amount) || 0,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-event', event.id] })
      toast.success('Participants updated')
      setEditingParticipants(false)
    },
    onError: () => toast.error('Failed to update participants'),
  })

  function copyLink() {
    const url = `${window.location.origin}/public/group/${event.public_token}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied!'),
      () => toast.error('Failed to copy link'),
    )
  }

  function startEditParticipants() {
    const existingParticipants = eventDetail?.participants ?? []
    if (existingParticipants.length > 0) {
      setParticipantRows(
        existingParticipants.map(p => ({
          friend_id: p.friend_id,
          share_amount: p.share_amount.toFixed(2),
        })),
      )
    } else {
      // Default: equal split among all friends + host (you)
      const count = friends.length + 1
      const equalShare = count > 0 ? Math.floor((event.total_amount / count) * 100) / 100 : 0
      const rows: ParticipantRow[] = friends.map(f => ({
        friend_id: f.id,
        share_amount: equalShare.toFixed(2),
      }))
      rows.push({ friend_id: null, share_amount: equalShare.toFixed(2) })
      setParticipantRows(rows)
    }
    setEditingParticipants(true)
  }

  const participantLabel = (friendId: string | null) => {
    if (friendId === null) return 'You (host)'
    const f = friends.find(fr => fr.id === friendId)
    return f?.name ?? friendId.slice(0, 8) + '...'
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-left font-semibold hover:text-foreground/80 transition-colors"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {event.title}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatMoney(event.total_amount)}
            </span>
            <Button variant="ghost" size="sm" onClick={copyLink} aria-label="Copy public link">
              <Copy size={14} />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground ml-6">{event.date}</p>

        {expanded && (
          <div className="mt-4 flex flex-col gap-3">
            {eventDetail?.participants && eventDetail.participants.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b border-border/40">
                    <th className="text-left pb-2 pr-3">Participant</th>
                    <th className="text-right pb-2 pr-3">Share</th>
                    <th className="text-left pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {eventDetail.participants.map((p, i) => (
                    <tr key={i} className="border-b border-border/20 last:border-0">
                      <td className="py-2 pr-3">{participantLabel(p.friend_id)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatMoney(p.share_amount)}
                      </td>
                      <td className="py-2">
                        <Badge variant={p.is_confirmed ? 'default' : 'outline'}>
                          {p.is_confirmed ? 'Confirmed' : 'Pending'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">No participants set</p>
            )}

            {editingParticipants ? (
              <div className="border border-border/40 rounded-lg p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold">Set Participants</p>
                {participantRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm flex-1">{participantLabel(row.friend_id)}</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-28 text-right"
                      value={row.share_amount}
                      onChange={e => {
                        const updated = [...participantRows]
                        updated[i] = { ...updated[i], share_amount: e.target.value }
                        setParticipantRows(updated)
                      }}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setParticipantsMutation.mutate()}
                    disabled={setParticipantsMutation.isPending}
                  >
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingParticipants(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="self-start" onClick={startEditParticipants}>
                Edit Participants
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── FriendsPage ──────────────────────────────────────────────────────────

interface CreateFriendFormState {
  name: string
  notes: string
}

interface CreateEventFormState {
  title: string
  date: string
  total_amount: string
  notes: string
}

const EMPTY_FRIEND_FORM: CreateFriendFormState = { name: '', notes: '' }
const EMPTY_EVENT_FORM: CreateEventFormState = { title: '', date: '', total_amount: '', notes: '' }

export function FriendsPage() {
  const queryClient = useQueryClient()
  const [showCreateFriend, setShowCreateFriend] = useState(false)
  const [friendForm, setFriendForm] = useState<CreateFriendFormState>(EMPTY_FRIEND_FORM)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [eventForm, setEventForm] = useState<CreateEventFormState>(EMPTY_EVENT_FORM)

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: listFriends,
  })

  const { data: groupEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['group-events'],
    queryFn: listGroupEvents,
  })

  const createFriendMutation = useMutation({
    mutationFn: () =>
      createFriend({
        name: friendForm.name,
        ...(friendForm.notes ? { notes: friendForm.notes } : {}),
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
        title: eventForm.title,
        date: eventForm.date,
        total_amount: parseFloat(eventForm.total_amount),
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

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      {/* Friends & Debts */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Friends & Debts</h1>
          <Button size="sm" onClick={() => setShowCreateFriend(v => !v)}>
            <Plus size={16} />
            Add Friend
          </Button>
        </div>

        {showCreateFriend && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Friend</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={e => {
                  e.preventDefault()
                  createFriendMutation.mutate()
                }}
                className="flex flex-col gap-4"
              >
                <div>
                  <label className="block text-xs font-semibold mb-1">Name</label>
                  <Input
                    required
                    value={friendForm.name}
                    onChange={e => setFriendForm({ ...friendForm, name: e.target.value })}
                    placeholder="Alice"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Notes (optional)</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    rows={2}
                    value={friendForm.notes}
                    onChange={e => setFriendForm({ ...friendForm, notes: e.target.value })}
                    placeholder="Optional notes about this friend"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createFriendMutation.isPending}>
                    Create Friend
                  </Button>
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
            </CardContent>
          </Card>
        )}

        {friendsLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-14 rounded-xl bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-semibold">No friends yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a friend to start tracking debts.</p>
          </div>
        ) : (
          friends.map(friend => <FriendCard key={friend.id} friend={friend} />)
        )}
      </section>

      {/* Group Events */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Group Events</h2>
          <Button size="sm" onClick={() => setShowCreateEvent(v => !v)}>
            <Plus size={16} />
            New Event
          </Button>
        </div>

        {showCreateEvent && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Group Event</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={e => {
                  e.preventDefault()
                  createEventMutation.mutate()
                }}
                className="flex flex-col gap-4"
              >
                <div>
                  <label className="block text-xs font-semibold mb-1">Title</label>
                  <Input
                    required
                    value={eventForm.title}
                    onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
                    placeholder="Pizza Night"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Date</label>
                  <Input
                    type="date"
                    required
                    value={eventForm.date}
                    onChange={e => setEventForm({ ...eventForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Total Amount ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={eventForm.total_amount}
                    onChange={e => setEventForm({ ...eventForm, total_amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Notes (optional)</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    rows={2}
                    value={eventForm.notes}
                    onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createEventMutation.isPending}>
                    Create Event
                  </Button>
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
            </CardContent>
          </Card>
        )}

        {eventsLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-14 rounded-xl bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        ) : groupEvents.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-semibold">No group events yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create an event to split costs with friends.</p>
          </div>
        ) : (
          groupEvents.map(event => (
            <GroupEventCard key={event.id} event={event} friends={friends} />
          ))
        )}
      </section>

      <div className="h-8" />
    </div>
  )
}
