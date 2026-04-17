import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CompactEntityTable } from '@/components/CompactEntityTable'
import { fetchPublicGroup, type ParticipantResponse } from '@/lib/api'
import { formatMoney } from '@/lib/format'
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
          {formatMoney(data.total_amount)} total
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
          {data.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No participants set</p>
          ) : (
            <CompactEntityTable
              entityLabel="Participant"
              secondaryLabel="Share / Status"
              showActions={false}
              items={data.participants.map((p, i) => ({
                id: `${p.friend_id ?? 'host'}-${i}`,
                primary: `${participantLabel(p, i)}${p.is_host ? ' · Host' : ''}`,
                secondary: `${formatMoney(p.share_amount)} · ${p.is_confirmed ? 'Confirmed' : 'Pending'}`,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">This is a read-only view.</p>
    </div>
  )
}
