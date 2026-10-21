import { useMemo, type RefObject } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoneyValue } from '@/components/ui/money-value'

export interface ParticipantEditorProps {
  eventId: string
  eventTotalAmount: number
  participantIds: Array<string | null>
  hostFriendId: string | null
  participantConfirmedMap: Map<string, boolean>
  participantLabel: (friendId: string | null) => string
  isLoading: boolean
  isPending: boolean
  showParticipantsInput: boolean
  participantsInput: string
  participantsInputRef: RefObject<HTMLInputElement | null>
  highlightParticipantsInput: boolean
  onParticipantsInputChange: (value: string) => void
  onParticipantsInputOpen: () => void
  onParticipantsInputClose: () => void
  onAddParticipants: (closeAfter?: boolean) => Promise<void> | void
  onHostChange: (hostFriendId: string | null) => void
  onToggleParticipantConfirmed: (friendId: string | null) => void
  onRemoveParticipant: (friendId: string | null) => void
  addParticipantsLabel?: string
  emptyLabel?: string
}

export function ParticipantEditor({
  eventId,
  eventTotalAmount,
  participantIds,
  hostFriendId,
  participantConfirmedMap,
  participantLabel,
  isLoading,
  isPending,
  showParticipantsInput,
  participantsInput,
  participantsInputRef,
  highlightParticipantsInput,
  onParticipantsInputChange,
  onParticipantsInputOpen,
  onParticipantsInputClose,
  onAddParticipants,
  onHostChange,
  onToggleParticipantConfirmed,
  onRemoveParticipant,
  addParticipantsLabel = 'Adicionar participantes',
  emptyLabel = 'Nenhum participante definido',
}: ParticipantEditorProps) {
  const equalShare = useMemo(() => {
    if (participantIds.length === 0) return 0
    return eventTotalAmount / participantIds.length
  }, [eventTotalAmount, participantIds])

  return (
    <>
      <div className="flex gap-2 items-center">
        {showParticipantsInput ? (
          <Input
            ref={participantsInputRef}
            value={participantsInput}
            onChange={e => onParticipantsInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void onAddParticipants(true)
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onParticipantsInputClose()
              }
            }}
            placeholder="Adicionar participantes: lin, Mari, Amanda"
            className={highlightParticipantsInput ? 'border-primary ring-2 ring-primary/30' : undefined}
            disabled={isPending}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={onParticipantsInputOpen} disabled={isPending}>
            <Plus size={14} />
            {addParticipantsLabel}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium">Anfitrião</Label>
        <Select
          value={hostFriendId ?? '__owner__'}
          onValueChange={(value) => {
            const nextHost = value === '__owner__' ? null : value
            onHostChange(nextHost)
          }}
        >
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Selecione o anfitrião" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__owner__">Você (admin)</SelectItem>
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
        <div className="text-center py-8 text-muted-foreground">{emptyLabel}</div>
      ) : (
        <>
          <div className="sm:hidden flex flex-col gap-2">
            {participantIds.map((friendId, i) => (
              <div key={`${eventId}-${friendId ?? 'host'}-${i}`} className="border rounded-md p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="inline-flex items-center gap-1 font-medium">
                    {participantLabel(friendId)}
                    {((hostFriendId === null && friendId === null) || (hostFriendId !== null && friendId === hostFriendId)) && (
                      <Badge variant="secondary">Anfitrião</Badge>
                    )}
                  </div>
                  <MoneyValue amount={equalShare} currency="BRL" showSign="never" tone="auto" className="font-semibold" />                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge variant={(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'default' : 'outline'}>
                    {(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'Confirmado' : 'Pendente'}
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onToggleParticipantConfirmed(friendId)}
                      aria-label="Alternar confirmação de pagamento"
                    >
                      <Check size={14} />
                      Alternar
                    </Button>
                    {friendId !== null && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRemoveParticipant(friendId)}
                        aria-label="Remover participante"
                      >
                        <X size={14} />
                        Remover
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
                  <th className="text-left px-3 py-2 font-medium">Participante</th>
                  <th className="text-right px-3 py-2 font-medium">Parte</th>
                  <th className="text-left px-3 py-2 font-medium">Situação</th>
                  <th className="text-right px-3 py-2 font-medium w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {participantIds.map((friendId, i) => (
                  <tr key={`${eventId}-${friendId ?? 'host'}-${i}`} className="hover:bg-muted/30">
                    <td className="px-3 py-2 inline-flex items-center gap-1">
                      {participantLabel(friendId)}
                      {((hostFriendId === null && friendId === null) || (hostFriendId !== null && friendId === hostFriendId)) && (
                        <Badge variant="secondary">Anfitrião</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      <MoneyValue amount={equalShare} currency="BRL" showSign="never" tone="auto" className="font-medium" />
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'default' : 'outline'}>
                        {(participantConfirmedMap.get(friendId ?? '__owner__') ?? false) ? 'Confirmado' : 'Pendente'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => onToggleParticipantConfirmed(friendId)}
                          aria-label="Alternar confirmação de pagamento"
                        >
                          <Check size={14} />
                        </Button>
                        {friendId !== null && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => onRemoveParticipant(friendId)}
                            aria-label="Remover participante"
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
    </>
  )
}
