import { useEffect, useContext } from 'react'
import { X } from 'lucide-react'
import { AccountContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'
import { SidebarNav } from '@/components/SidebarNav'

interface MobileDrawerProps {
  onClose: () => void
}

export function MobileDrawer({ onClose }: MobileDrawerProps) {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="fixed top-0 left-0 bottom-0 w-72 bg-background border-r border-border/50 z-50 lg:hidden flex flex-col">
        <div className="px-4 py-4 border-b border-border/50 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">CIBI</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close navigation menu"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-3 border-b border-border/50">
          <AccountSelector
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            fullWidth
          />
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav onNavigate={onClose} />
        </div>
      </div>
    </>
  )
}
