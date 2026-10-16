import { useContext } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KvList } from '@/components/ui/kv-list'
import { useLayout } from '@/widgets/layoutContext'
import { InspectorList } from '@/widgets/InspectorList'
import { useWorkspace } from '@/widgets/useWorkspace'
import { KeyChips } from './KeyChips'
import { SelectionDetailContext, useSelection, type SelectionDetail } from './selection'

/** The inspector body: the selected row's detail when there is one, otherwise the saved widget list. */
export function Inspector() {
  const detail = useContext(SelectionDetailContext)
  const { select } = useSelection()
  const layout = useLayout()
  const { data } = useWorkspace()

  if (detail) return <InspectorDetail detail={detail} onBack={() => select(null)} />
  if (!layout || !data) return null
  return <InspectorList layout={layout} data={data} />
}

function InspectorDetail({ detail, onBack }: { detail: SelectionDetail; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft />
          Back
          <KeyChips keys="Escape" />
        </Button>
        {detail.badge && <Badge variant="secondary">{detail.badge}</Badge>}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10.5px] tracking-[0.05em] text-faint uppercase">{detail.eyebrow}</span>
        <div className="num text-[22px] font-medium tracking-[-0.04em]">{detail.amount}</div>
        <h2 className="text-sm leading-snug font-semibold break-words">{detail.title}</h2>
      </div>

      <KvList rows={detail.rows} />

      <div className="flex flex-wrap gap-2">
        {detail.actions.map(action => {
          const Icon = action.icon
          return (
            <Button
              key={action.id}
              variant={action.variant ?? 'outline'}
              size="sm"
              disabled={action.disabled}
              onClick={action.run}
            >
              {Icon && <Icon />}
              {action.label}
              {action.keys && <KeyChips keys={action.keys} inverse={action.variant === 'default'} />}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
