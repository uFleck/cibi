import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type MobileActionButtonProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  icon: LucideIcon
  label: string
  iconSize?: number
}

export function MobileActionButton({
  icon: Icon,
  label,
  iconSize = 16,
  className,
  ...props
}: MobileActionButtonProps) {
  return (
    <Button {...props} className={cn('h-10', className)}>
      <Icon size={iconSize} />
      {label}
    </Button>
  )
}
