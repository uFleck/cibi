import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import { keyChips } from '@/hooks/useKeyboardShortcuts'

interface KeyChipsProps {
  keys: string
  inverse?: boolean
  className?: string
}

export function KeyChips({ keys, inverse = false, className }: KeyChipsProps) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keyChips(keys).map((chip, index) => (
        <Kbd
          key={`${chip}-${index}`}
          className={inverse ? 'border-current/40 bg-transparent text-current opacity-80' : undefined}
        >
          {chip}
        </Kbd>
      ))}
    </span>
  )
}
