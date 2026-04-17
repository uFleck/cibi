import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[85vh] overflow-y-auto sm:max-w-lg',
          contentClassName,
        )}
      >
        {!hideHeader && (title || description) ? (
          <DialogHeader>
            {title ? <DialogTitle>{title}</DialogTitle> : null}
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  )
}
