import { KeyChips } from './KeyChips'

export interface HintItem {
  keys: string
  label: string
}

interface HintBarProps {
  items: HintItem[]
  hidden?: boolean
}

export function HintBar({ items, hidden = false }: HintBarProps) {
  if (hidden) return null
  return (
    <div
      role="note"
      aria-label="Keyboard hints"
      className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-[11px] whitespace-nowrap text-faint shadow-pop backdrop-blur max-[899px]:hidden"
    >
      {items.map(item => (
        <span key={item.keys} className="inline-flex items-center gap-1.5">
          <KeyChips keys={item.keys} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
