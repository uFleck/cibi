import { ChevronDown, Keyboard } from 'lucide-react'
import { KeyChips } from './KeyChips'

export interface HintItem {
  keys: string
  label: string
}

interface HintBarProps {
  items: HintItem[]
  hidden?: boolean
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

const POSITION = 'absolute bottom-3 left-1/2 z-20 -translate-x-1/2 max-[899px]:hidden'

export function HintBar({ items, hidden = false, collapsed, onCollapsedChange }: HintBarProps) {
  if (hidden) return null
  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Show keyboard hints"
        onClick={() => onCollapsedChange(false)}
        className={`${POSITION} grid size-7 place-items-center rounded-full border border-line bg-surface/90 text-faint shadow-pop backdrop-blur transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25`}
      >
        <Keyboard size={14} />
      </button>
    )
  }
  return (
    <div
      role="note"
      aria-label="Keyboard hints"
      className={`${POSITION} pointer-events-none flex items-center gap-3 rounded-full border border-line bg-surface/90 py-1.5 pr-1.5 pl-3 text-[11px] whitespace-nowrap text-faint shadow-pop backdrop-blur`}
    >
      {items.map(item => (
        <span key={item.keys} className="inline-flex items-center gap-1.5">
          <KeyChips keys={item.keys} />
          {item.label}
        </span>
      ))}
      <button
        type="button"
        aria-label="Hide keyboard hints"
        onClick={() => onCollapsedChange(true)}
        className="pointer-events-auto grid size-5 place-items-center rounded-full transition-colors outline-none hover:bg-surface-3 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
      >
        <ChevronDown size={13} />
      </button>
    </div>
  )
}
