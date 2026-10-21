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
import { frequencyLabel } from '@/lib/labels'

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
    eyebrow: selectedTxn.next_occurrence ? `Vence ${formatDate(selectedTxn.next_occurrence)}` : 'Agendada',
    amount: <MoneyValue amount={selectedTxn.amount} currency={data.account.currency} showSign="auto" tone="negative" />,
    badge: selectedTxn.is_recurring ? 'Recorrente' : undefined,
    rows: [
      { label: 'Conta', value: data.account.name },
      { label: 'Próximo', value: <span className="num">{selectedTxn.next_occurrence ? formatDate(selectedTxn.next_occurrence) : '-'}</span> },
      { label: 'Frequência', value: frequencyLabel(selectedTxn.frequency) },
    ],
    actions: [{
      id: 'open',
      label: 'Abrir em Transações',
      variant: 'outline',
      run: () => void navigate({ to: '/transactions', search: { select: selectedTxn.id } }),
    }],
  } : null)

  useEffect(() => {
    if (isError) toast.error('Não deu para carregar os dados financeiros. Tentando de novo em 30 segundos.')
  }, [isError])

  if (!data) {
    if (isLoading) return <OverviewSkeleton />
    return (
      <Page>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">Crie sua primeira conta para começar</p>
            <Link to="/accounts">
              <Button size="sm">
                <Plus size={16} />
                Criar conta
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
            <p className="mb-2 font-semibold">Configure suas finanças</p>
            <div className="mx-auto max-w-xs space-y-1 text-left text-sm text-muted-foreground">
              <p>&#9312; <Link to="/transactions" search={{ tab: 'pay-schedules' }} className="underline">Adicionar recebimento</Link> — diga quando você recebe</p>
              <p>&#9313; <Link to="/transactions" className="underline">Criar contas recorrentes</Link> — assinaturas, aluguel, etc.</p>
              <p>&#9314; <span>Veja o que você pode pagar</span> — use o widget Posso comprar?</p>
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
    <div role="status" aria-label="Carregando painel" className="mx-auto grid w-full max-w-[1400px] grid-cols-12 gap-3 px-4 py-6 sm:px-6">
      {SKELETON_SPANS.map((span, i) => (
        <div
          key={i}
          style={{ gridColumn: `span ${span} / span ${span}` }}
          className="h-40 animate-pulse rounded-md border border-line bg-surface/60"
        />
      ))}
      <span className="sr-only">Carregando...</span>
    </div>
  )
}
