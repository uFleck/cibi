import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { formatDate } from '@/lib/format'
import { useSelection, usePublishSelection } from '@/shell/selection'
import { useLayout } from '@/widgets/layoutContext'
import { WallGrid } from '@/widgets/WallGrid'
import { useWorkspace } from '@/widgets/useWorkspace'

const SKELETON_SPANS = [12, 8, 4, 6, 6]

export function OverviewPage() {
  const workspace = useWorkspace()
  const layout = useLayout()
  const navigate = useNavigate()
  const { selectedId } = useSelection()
  const { data, isLoading, isError } = workspace

  const selectedTxn = data?.transactions.find(t => t.id === selectedId)
  usePublishSelection(data && selectedTxn ? {
    id: selectedTxn.id,
    title: selectedTxn.title,
    eyebrow: selectedTxn.next_occurrence ? `Due ${formatDate(selectedTxn.next_occurrence)}` : 'Scheduled',
    amount: <MoneyValue amount={selectedTxn.amount} currency={data.account.currency} showSign="auto" tone="negative" />,
    badge: selectedTxn.is_recurring ? 'Recurring' : undefined,
    rows: [
      { label: 'Account', value: data.account.name },
      { label: 'Next', value: <span className="num">{selectedTxn.next_occurrence ? formatDate(selectedTxn.next_occurrence) : '-'}</span> },
      { label: 'Frequency', value: selectedTxn.frequency ?? '-' },
    ],
    actions: [{
      id: 'open',
      label: 'Open in Transactions',
      variant: 'outline',
      run: () => void navigate({ to: '/transactions', search: { select: selectedTxn.id } }),
    }],
  } : null)

  useEffect(() => {
    if (isError) toast.error('Could not load financial data. Retrying in 30 seconds.')
  }, [isError])

  if (!data) {
    if (isLoading) return <OverviewSkeleton />
    return (
      <Page>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">Create your first account to get started</p>
            <Link to="/accounts">
              <Button size="sm">
                <Plus size={16} />
                Create Account
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      {data.transactions.length === 0 && data.paySchedules.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="mb-2 font-semibold">Set up your finances</p>
            <div className="mx-auto max-w-xs space-y-1 text-left text-sm text-muted-foreground">
              <p>&#9312; <Link to="/transactions" search={{ tab: 'pay-schedules' }} className="underline">Add a pay schedule</Link> — tell us when you get paid</p>
              <p>&#9313; <Link to="/transactions" className="underline">Create recurring bills</Link> — subscriptions, rent, etc.</p>
              <p>&#9314; <span>Check what you can afford</span> — use the Can I buy it? widget</p>
            </div>
          </CardContent>
        </Card>
      )}
      {layout ? <WallGrid layout={layout} data={data} /> : <OverviewSkeleton />}
    </Page>
  )
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 sm:px-6">{children}</div>
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading overview" className="mx-auto grid w-full max-w-[1400px] grid-cols-12 gap-3 px-4 py-6 sm:px-6">
      {SKELETON_SPANS.map((span, i) => (
        <div
          key={i}
          style={{ gridColumn: `span ${span} / span ${span}` }}
          className="h-40 animate-pulse rounded-md border border-line bg-surface/60"
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  )
}
