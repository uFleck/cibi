import { useContext } from 'react'
import { AccountContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'
import { SidebarNav } from '@/components/SidebarNav'
import { Sheet, SheetContent } from '@/components/ui/sheet'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="left" className="w-72 p-0 gap-0">
        <div className="px-4 py-5 border-b border-border/50">
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">CIBI</span>
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
      </SheetContent>
    </Sheet>
  )
}
