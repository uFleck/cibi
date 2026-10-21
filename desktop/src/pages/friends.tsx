/* eslint-disable react-hooks/set-state-in-effect */
import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Save, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, pageShell } from '@/components/ui/page-header'
import { Input } from '@/components/ui/input'
import { AppModal } from '@/components/AppModal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoneyValue } from '@/components/ui/money-value'
import { DataList } from '@/components/ui/data-list'
import { ROW_KEYS } from '@/lib/row-actions'
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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
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
      toast.success('Amigo atualizado')
    },
    onError: () => toast.error('Não deu para atualizar o amigo'),
  })

  const deleteFriendMutation = useMutation({
    mutationFn: () => deleteFriend(friend!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      toast.success('Amigo excluído')
      onOpenChange(false)
    },
    onError: (error) => toast.error(error.message || 'Não deu para excluir o amigo'),
  })

  if (!friend) return null

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Detalhes do amigo"
      description="Gerencie o amigo e o acesso pelo link"
    >
        <ConfirmDialog
          open={confirmDeleteFriendOpen}
          onCancel={() => setConfirmDeleteFriendOpen(false)}
          onConfirm={() => {
            setConfirmDeleteFriendOpen(false)
            deleteFriendMutation.mutate()
          }}
          title={`Excluir "${friend.name}"?`}
          description="O amigo será removido. Amigos com dívidas ou eventos em grupo não podem ser excluídos."
          confirmLabel="Excluir"
        />

        <div className="flex flex-col gap-2">
          <Input
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            placeholder="Nome do amigo"
          />
          <Input
            value={pixKeyDraft}
            onChange={e => setPixKeyDraft(e.target.value)}
            placeholder="Chave PIX (opcional)"
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => {
                if (!nameDraft.trim()) {
                  toast.error('Nome é obrigatório')
                  return
                }
                renameMutation.mutate()
              }}
              disabled={renameMutation.isPending}
              aria-label="Salvar amigo"
            >
              <Save size={14} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => setConfirmDeleteFriendOpen(true)}
              disabled={deleteFriendMutation.isPending}
              aria-label="Excluir amigo"
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
      toast.success('Evento em grupo atualizado')
    },
    onError: () => toast.error('Não deu para atualizar o evento em grupo'),
  })

  const deleteEventMutation = useMutation({
    mutationFn: () => deleteGroupEvent(event!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events'] })
      toast.success('Evento em grupo excluído')
      onOpenChange(false)
    },
    onError: () => toast.error('Não deu para excluir o evento em grupo'),
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
      toast.success('Participantes atualizados')
    },
    onError: () => toast.error('Não deu para atualizar os participantes'),
  })

  const participantLabel = (friendId: string | null) => {
    if (friendId === null) return 'Você (admin)'
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
          errors.push(`Não deu para criar: ${token}`)
        }
        continue
      }

      if (res.error && res.error !== 'empty') errors.push(res.error.replace('ambiguous:', 'Mais de um amigo para:'))
    }

    setParticipantsInput('')
    if (changed) persistParticipants(next, nextStatus, hostFriendId)
    if (errors.length > 0) toast.error(errors.join(' | '))
    if (closeAfter) setShowParticipantsInput(false)
  }

  function removeParticipant(friendId: string | null) {
    if (friendId === null) {
      toast.error('Você (admin) deve continuar nos participantes')
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
      title="Detalhes do evento em grupo"
      description="Gerencie o evento, os participantes e o acesso pelo link"
      contentClassName="md:w-[720px] md:max-w-[720px]"
    >

        <ConfirmDialog
          open={confirmDeleteEventOpen}
          onCancel={() => setConfirmDeleteEventOpen(false)}
          onConfirm={() => {
            setConfirmDeleteEventOpen(false)
            deleteEventMutation.mutate()
          }}
          title={`Excluir "${event.title}"?`}
          description="Isso remove todos os participantes."
          confirmLabel="Excluir"
        />

        <div className="flex gap-2 items-center">
          <Input
            className="flex-1"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            placeholder="Nome do evento em grupo"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => {
              if (!titleDraft.trim()) {
                toast.error('Título é obrigatório')
                return
              }
              renameMutation.mutate()
            }}
            disabled={renameMutation.isPending}
            aria-label="Salvar evento"
          >
            <Save size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setConfirmDeleteEventOpen(true)}
            disabled={deleteEventMutation.isPending}
            aria-label="Excluir evento"
          >
            <Trash2 size={14} />
          </Button>
        </div>

        <div className="font-mono text-[12px] text-muted-foreground">
          {formatDate(event.date)} · <MoneyValue amount={event.total_amount} currency="BRL" showSign="never" tone="neutral" />
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
          addParticipantsLabel="Adicionar participantes"
          emptyLabel="Nenhum participante definido"
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
      toast.success('Amigo adicionado')
      setFriendForm(EMPTY_FRIEND_FORM)
      setShowCreateFriend(false)
    },
    onError: () => toast.error('Não deu para adicionar o amigo'),
  })

  const createEventMutation = useMutation({
    mutationFn: (totalAmount: number) =>
      createGroupEvent({
        account_id: selectedAccountId!,
        title: eventForm.title,
        date: eventForm.date,
        total_amount: totalAmount,
        ...(eventForm.notes ? { notes: eventForm.notes } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events'] })
      toast.success('Evento em grupo criado')
      setEventForm(EMPTY_EVENT_FORM)
      setShowCreateEvent(false)
    },
    onError: () => toast.error('Não deu para criar o evento em grupo'),
  })

  const activeFriend = friends.find(f => f.id === activeFriendId) ?? null
  const activeEvent = groupEvents.find(e => e.id === activeEventId) ?? null

  function handleCreateEvent(e: FormEvent) {
    e.preventDefault()

    const totalAmount = parseDecimalInput(eventForm.total_amount)
    if (totalAmount == null) {
      toast.error('Informe um valor total válido')
      return
    }

    // Stored as whole cents: anything that rounds to 0 (or below) would be saved as 0.
    if (Math.round(totalAmount * 100) <= 0) {
      toast.error('O valor total deve ser maior que 0.')
      return
    }

    if (!selectedAccountId) {
      toast.error('Selecione uma conta primeiro')
      return
    }

    createEventMutation.mutate(totalAmount)
  }

  return (
    <div className={pageShell}>
      <section className="flex flex-col gap-3">
        <PageHeader
          eyebrow="Gastos compartilhados"
          title="Amigos"
          description="Acompanhe quem deve o quê e acerte as contas."
          actions={
            <Button size="sm" onClick={() => setShowCreateFriend(true)}>
              <Plus size={16} />
              Adicionar amigo
            </Button>
          }
        />

        {friendsLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[29px] rounded-md border border-line bg-surface-2 animate-pulse" />
            ))}
          </div>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-md border border-line bg-surface py-8 text-center">
            <p className="text-[13px] font-semibold text-foreground">Nenhum amigo ainda</p>
            <p className="text-[12px] text-faint">Adicione um amigo para acompanhar dívidas.</p>
            <Button size="sm" className="mt-2" onClick={() => setShowCreateFriend(true)}>Adicionar amigo</Button>
          </div>
        ) : (
          <DataList
            aria-label="Amigos"
            rows={friends}
            rowId={(friend) => friend.id}
            columns={[
              {
                id: 'friend',
                header: 'Amigo',
                title: (friend) => friend.name,
                cell: (friend) => (
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[10px] font-medium text-muted-foreground">
                      {initialsOf(friend.name)}
                    </span>
                    <span className="truncate font-medium text-foreground">{friend.name}</span>
                  </div>
                ),
              },
              {
                id: 'pix',
                header: 'Chave PIX',
                className: 'hidden w-[26%] sm:table-cell',
                title: (friend) => friend.pix_key,
                cell: (friend) => <span className="font-mono text-muted-foreground">{friend.pix_key || '—'}</span>,
              },
              {
                id: 'notes',
                header: 'Observações',
                className: 'hidden w-[28%] md:table-cell',
                title: (friend) => friend.notes,
                cell: (friend) => <span className="text-muted-foreground">{friend.notes || '—'}</span>,
              },
            ]}
            actions={(friend) => [
              {
                id: 'open',
                label: 'Abrir',
                ariaLabel: 'Ver detalhes do amigo',
                icon: Eye,
                keys: ROW_KEYS.open,
                primary: true,
                run: () => setActiveFriendId(friend.id),
              },
            ]}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Eventos em grupo</h2>
          <Button size="sm" onClick={() => setShowCreateEvent(true)}>
            <Plus size={16} />
            Novo evento
          </Button>
        </div>


        {eventsLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[29px] rounded-md border border-line bg-surface-2 animate-pulse" />
            ))}
          </div>
        ) : groupEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-md border border-line bg-surface py-8 text-center">
            <p className="text-[13px] font-semibold text-foreground">Nenhum evento em grupo ainda</p>
            <p className="text-[12px] text-faint">Crie um evento para dividir custos.</p>
          </div>
        ) : (
          <DataList
            aria-label="Eventos em grupo"
            rows={groupEvents}
            rowId={(event) => event.id}
            columns={[
              { id: 'event', header: 'Evento', cell: (event) => <span className="font-medium text-foreground">{event.title}</span> },
              { id: 'date', header: 'Data', className: 'w-[22%]', cell: (event) => <span className="font-mono text-muted-foreground">{formatDate(event.date)}</span> },
              {
                id: 'total',
                header: 'Total',
                align: 'right',
                numeric: true,
                className: 'w-[22%]',
                cell: (event) => <MoneyValue amount={event.total_amount} currency="BRL" showSign="never" tone="neutral" />,
              },
            ]}
            actions={(event) => [
              {
                id: 'open',
                label: 'Abrir',
                ariaLabel: 'Ver detalhes do evento em grupo',
                icon: Eye,
                keys: ROW_KEYS.open,
                primary: true,
                run: () => setActiveEventId(event.id),
              },
            ]}
          />
        )}
      </section>

      <AppModal
        open={showCreateEvent}
        onOpenChange={(open) => {
          setShowCreateEvent(open)
          if (!open) setEventForm(EMPTY_EVENT_FORM)
        }}
        title="Novo evento em grupo"
        description="Crie um evento para dividir custos com amigos."
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
          submitLabel="Criar evento"
          cancelLabel="Descartar"
        />
      </AppModal>

      <AppModal
        open={showCreateFriend}
        onOpenChange={(open) => {
          setShowCreateFriend(open)
          if (!open) setFriendForm(EMPTY_FRIEND_FORM)
        }}
        title="Novo amigo"
        description="Crie um amigo para acompanhar dívidas e compartilhar o link."
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
          submitLabel="Criar amigo"
          cancelLabel="Descartar"
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
