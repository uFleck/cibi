import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'

interface EditSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
}

export function EditSheet({ open, onOpenChange, title, description, children }: EditSheetProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const side = isDesktop ? 'right' : 'bottom'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={
          isDesktop
            ? 'w-[480px] sm:max-w-[480px] overflow-y-auto flex flex-col gap-0'
            : 'max-h-[85vh] overflow-y-auto flex flex-col gap-0'
        }
      >
        {(title || description) && (
          <SheetHeader className="pb-4">
            {title && <SheetTitle>{title}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        <div className="flex-1 px-4 pb-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
