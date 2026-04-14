import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchPublicGroup, type ParticipantResponse } from '@/lib/api'
import { formatMoney } from '@/lib/format'

function participantLabel(p: ParticipantResponse, index: number): string {
  if (p.friend_id === null) return 'Host'
  return `Participant ${index + 1}`
}

export function GroupPublicPage() {
  const { token } = useParams({ strict: false }) as { token: string }

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
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{data.date}</span>
        <span className="font-medium text-foreground tabular-nums">
          {formatMoney(data.total_amount)} total
        </span>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b border-border/40">
                    <th className="text-left pb-2 pr-3">Participant</th>
                    <th className="text-right pb-2 pr-3">Share</th>
                    <th className="text-left pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.participants.map((p, i) => (
                    <tr key={i} className="border-b border-border/20 last:border-0">
                      <td className="py-2 pr-3">{participantLabel(p, i)}</td>
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
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">This is a read-only view.</p>
    </div>
  )
}
