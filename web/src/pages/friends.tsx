/* eslint-disable react-hooks/set-state-in-effect */
import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AppModal } from '@/components/AppModal'
import { CompactEntityTable } from '@/components/CompactEntityTable'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoneyValue } from '@/components/ui/money-value'
import { FriendForm } from '@/components/FriendForm'
import { GroupEventForm, type GroupEventFormState } from '@/components/GroupEventForm'
import { ParticipantEditor } from '@/components/ParticipantEditor'
import {
  listFriends,
  createFriend,
  updateFriend,
  deleteFriend,
  listGroupEvents,
  createGroupEvent,
  updateGroupEvent,
  deleteGroupEvent,
  getGroupEvent,
  setParticipants,
  type FriendResponse,
  type GroupEventResponse,
} from '@/lib/api'
import { formatDate } from '@/lib/format'
import { parseDecimalInput } from '@/lib/locale'
import { AccountContext } from '@/App'

interface CreateFriendFormState {
  name: string
  notes: string
  pix_key: string
}

const EMPTY_FRIEND_FORM: CreateFriendFormState = { name: '', notes: '', pix_key: '' }
const EMPTY_EVENT_FORM: GroupEventFormState = { title: '', date: '', total_amount: '', notes: '' }

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
  open,
  onOpenChange,
}: {
  friend: FriendResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [nameDraft, setNameDraft] = useState('')
  const [pixKeyDraft, setPixKeyDraft] = useState('')
  const [confirmDeleteFriendOpen, setConfirmDeleteFriendOpen] = useState(false)

  useEffect(() => {
    if (!friend) return
    setNameDraft(friend.name)
    setPixKeyDraft(friend.pix_key ?? '')
  }, [friend])

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
      toast.success('Friend deleted')
      onOpenChange(false)
    },
    onError: () => toast.error('Failed to delete friend'),
  })

  if (!friend) return null

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Friend Details"
      description="Manage friend and link access"
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
          {formatDate(event.date)} · <MoneyValue amount={event.total_amount} currency="BRL" showSign="auto" tone="auto" />
        </div>

        <ParticipantEditor
          eventId={event.id}
          eventTotalAmount={event.total_amount}
          participantIds={participantIds}
          hostFriendId={hostFriendId}
          participantConfirmedMap={participantConfirmedMap}
          participantLabel={participantLabel}
          isLoading={isLoading}
          isPending={saveParticipantsMutation.isPending}
          showParticipantsInput={showParticipantsInput}
          participantsInput={participantsInput}
          participantsInputRef={participantsInputRef}
          highlightParticipantsInput={highlightParticipantsInput}
          onParticipantsInputChange={setParticipantsInput}
          onParticipantsInputOpen={() => {
            setShowParticipantsInput(true)
            setHighlightParticipantsInput(true)
          }}
          onParticipantsInputClose={() => {
            setShowParticipantsInput(false)
            setParticipantsInput('')
            setHighlightParticipantsInput(false)
          }}
          onAddParticipants={addParticipantsFromInput}
          onHostChange={(nextHost) => persistParticipants(participantIds, participantConfirmedMap, nextHost)}
          onToggleParticipantConfirmed={toggleParticipantConfirmed}
          onRemoveParticipant={removeParticipant}
          addParticipantsLabel="Add participants"
          emptyLabel="No participants set"
        />
    </AppModal>
  )
}

export function FriendsPage() {
  const queryClient = useQueryClient()
  const { selectedAccountId } = useContext(AccountContext)

  const [showCreateFriend, setShowCreateFriend] = useState(false)
  const [friendForm, setFriendForm] = useState<CreateFriendFormState>(EMPTY_FRIEND_FORM)

  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [eventForm, setEventForm] = useState<GroupEventFormState>(EMPTY_EVENT_FORM)

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

    const totalAmount = parseDecimalInput(eventForm.total_amount)
    if (totalAmount == null) {
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
            items={friends.map(friend => ({
                id: friend.id,
                primary: friend.name,
                secondary: friend.pix_key ? `PIX: ${friend.pix_key}` : undefined,
                onCopy: async () => {
                  const ok = await copyToClipboard(`${window.location.origin}/public/friend/${friend.public_token}`)
                  if (ok) toast.success('Link copied')
                  else toast.error('Failed to copy link')
                },
                onOpen: () => setActiveFriendId(friend.id),
                copyAriaLabel: 'Copy public link',
                openAriaLabel: 'Access friend details',
              }))}

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
              secondary: (
                <>
                  {formatDate(event.date)} · <MoneyValue amount={event.total_amount} currency="BRL" showSign="auto" tone="auto" />
                </>
              ),              onCopy: async () => {
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
        <GroupEventForm
          form={eventForm}
          onChange={setEventForm}
          onSubmit={handleCreateEvent}
          onCancel={() => {
            setShowCreateEvent(false)
            setEventForm(EMPTY_EVENT_FORM)
          }}
          isSubmitting={createEventMutation.isPending}
          submitLabel="Create Event"
          cancelLabel="Discard"
        />
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
        <FriendForm
          name={friendForm.name}
          notes={friendForm.notes}
          pixKey={friendForm.pix_key}
          onNameChange={value => setFriendForm({ ...friendForm, name: value })}
          onNotesChange={value => setFriendForm({ ...friendForm, notes: value })}
          onPixKeyChange={value => setFriendForm({ ...friendForm, pix_key: value })}
          onSubmit={() => createFriendMutation.mutate()}
          onCancel={() => {
            setShowCreateFriend(false)
            setFriendForm(EMPTY_FRIEND_FORM)
          }}
          isSubmitting={createFriendMutation.isPending}
          submitLabel="Create Friend"
          cancelLabel="Discard"
        />
      </AppModal>

      <FriendDetailsModal
        friend={activeFriend}
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
