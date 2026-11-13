import { Button } from '@/components/ui/button'
import { BILL_KINDS, type BillKind } from '@/lib/bill-kinds'

interface BillKindFilterProps {
  selected: ReadonlySet<BillKind>
  counts: Record<BillKind, number>
  onToggle: (kind: BillKind) => void
}

/** Toggle chips, one per bill type, with how many rows each has. */
export function BillKindFilter({ selected, counts, onToggle }: BillKindFilterProps) {
  return (
    <div role="group" aria-label="Tipos de despesa" className="flex flex-wrap items-center gap-1.5">
      {BILL_KINDS.map(({ kind, label }) => {
        const on = selected.has(kind)
        return (
          <Button
            key={kind}
            type="button"
            size="xs"
            variant={on ? 'secondary' : 'ghost'}
            aria-pressed={on}
            onClick={() => onToggle(kind)}
            className={on ? 'bg-blush text-primary hover:bg-blush/80' : 'text-faint line-through decoration-1'}
          >
            {label}
            <span className="num text-[10px] opacity-70">{counts[kind]}</span>
          </Button>
        )
      })}
    </div>
  )
}
