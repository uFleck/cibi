import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { KeyChips } from '@/shell/KeyChips'

interface ChipProps {
  active: boolean
  onClick: () => void
  children: ReactNode
  /** Shortcut shown inside the chip, e.g. "1". */
  shortcut?: string
}

/** Filter chip: a toggle with an optional key hint. */
export function Chip({ active, onClick, children, shortcut }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-line bg-surface text-muted-foreground hover:border-line-strong hover:text-foreground',
      )}
    >
      {children}
      {shortcut && <KeyChips keys={shortcut} inverse={active} className="opacity-60" />}
    </button>
  )
}
