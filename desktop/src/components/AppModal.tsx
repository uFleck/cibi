import { type ReactNode, useCallback, useRef } from 'react'
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
  const modalRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef({
    startY: 0,
    dragging: false,
    threshold: 96,
  })

  const resetTransform = useCallback(() => {
    const el = modalRef.current
    if (!el) return
    el.style.transition = 'transform 180ms ease'
    el.style.transform = 'translateY(0px)'
    window.setTimeout(() => {
      if (!modalRef.current) return
      modalRef.current.style.transition = ''
    }, 180)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={modalRef}
        className={cn(
          'max-h-[80dvh] overflow-y-auto sm:max-h-[85vh] sm:max-w-lg',
          contentClassName,
        )}
        onTouchStart={(e) => {
          if (typeof window === 'undefined' || window.innerWidth >= 640) return
          const el = modalRef.current
          if (!el) return
          const scrolledTop = el.scrollTop <= 0
          dragState.current.dragging = scrolledTop
          dragState.current.startY = e.touches[0]?.clientY ?? 0
        }}
        onTouchMove={(e) => {
          if (!dragState.current.dragging) return
          const el = modalRef.current
          if (!el) return
          const currentY = e.touches[0]?.clientY ?? 0
          const delta = Math.max(0, currentY - dragState.current.startY)
          if (delta <= 0) return
          el.style.transition = ''
          el.style.transform = `translateY(${delta}px)`
        }}
        onTouchEnd={() => {
          if (!dragState.current.dragging) return
          const el = modalRef.current
          if (!el) return
          const match = el.style.transform.match(/translateY\((\d+(?:\.\d+)?)px\)/)
          const moved = match ? Number(match[1]) : 0
          dragState.current.dragging = false
          if (moved >= dragState.current.threshold) {
            onOpenChange(false)
            return
          }
          resetTransform()
        }}
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
