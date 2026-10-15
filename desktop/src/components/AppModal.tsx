import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

interface AppModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  contentClassName?: string
  hideHeader?: boolean
}

export function AppModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName,
  hideHeader = false,
}: AppModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const side = isDesktop ? 'right' : 'bottom'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          isDesktop
            ? 'w-[480px] sm:max-w-[480px] overflow-y-auto flex flex-col gap-0'
            : 'max-h-[85vh] overflow-y-auto flex flex-col gap-0',
          contentClassName,
        )}
      >
        {!hideHeader && (title || description) ? (
          <SheetHeader className="pb-4">
            {title ? <SheetTitle>{title}</SheetTitle> : null}
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
        ) : null}
        <div className="flex-1 px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
