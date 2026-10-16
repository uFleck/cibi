import { Button } from '@/components/ui/button'
import { KeyChips } from '@/components/ui/key-chips'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RowAction } from '@/lib/row-actions'
import { cn } from '@/lib/utils'

const REVEAL = cn(
  'opacity-0 transition-opacity',
  'group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-data-[selected=true]/row:opacity-100',
  '[@media(hover:none)]:opacity-100',
)

interface RowActionsProps {
  actions: RowAction[]
  className?: string
}

/** The icon buttons at the end of a list row. Hidden until the row is hovered, focused or selected. */
export function RowActions({ actions, className }: RowActionsProps) {
  if (actions.length === 0) return null
  return (
    <div className={cn('flex shrink-0 justify-end gap-0.5', REVEAL, className)} onClick={event => event.stopPropagation()}>
      {actions.map(action => {
        const Icon = action.icon
        return (
          <Tooltip key={action.id}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={action.disabled}
                aria-label={action.ariaLabel ?? action.label}
                aria-keyshortcuts={action.keys}
                className={cn(action.variant === 'destructive' && 'text-neg/70 hover:text-neg')}
                onClick={action.run}
              >
                {Icon && <Icon size={13} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              {action.label}
              {action.keys && <KeyChips keys={action.keys} />}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
