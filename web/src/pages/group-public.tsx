import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import { mapPublicGroupParticipantsToVM } from '@/components/debt/debt-list-mappers'
import { fetchPublicGroup, type ParticipantResponse } from '@/lib/api'
import { MoneyValue } from '@/components/ui/money-value'
import { copyToClipboard } from '@/lib/clipboard'
import { publicGroupRoute } from '@/router'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

function participantLabel(p: ParticipantResponse, index: number): string {
  if (p.name && p.name.trim().length > 0) return p.name
  if (p.friend_id === null) return 'Host'
  return `Participant ${index + 1}`
}

export function GroupPublicPage() {
  const { token } = publicGroupRoute.useParams()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-group', token],
    queryFn: () => fetchPublicGroup(token),
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
            <p className="font-semibold text-destructive">Event not found</p>
            <p className="text-sm text-muted-foreground mt-2">
              This link may be invalid or the event may have been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground items-center">
        <span>{data.date}</span>
        <span>Host: {data.host_name}</span>
        <span className="font-medium text-foreground tabular-nums">
          <MoneyValue amount={data.total_amount} currency="BRL" showSign="auto" tone="auto" /> total
        </span>
        {data.host_pix_key && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const ok = await copyToClipboard(data.host_pix_key!)
              if (ok) toast.success('PIX key copied')
              else toast.error('Failed to copy PIX key')
            }}
          >
            <Copy size={14} />
            Copy host PIX
          </Button>
        )}
      </div>

      {data.notes && (
        <p className="text-sm text-muted-foreground">{data.notes}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Participants</CardTitle>
        </CardHeader>
        <CardContent>
          <SharedDebtList
            view="public-group"
            items={mapPublicGroupParticipantsToVM(data.participants.map((p, i) => ({
              ...p,
              name: participantLabel(p, i),
            })))}
            emptyTitle="No participants set"
            emptyHint="Participants will appear here"
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">This is a read-only view.</p>
    </div>
  )
}
