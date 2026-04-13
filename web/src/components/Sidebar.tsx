import { useContext } from 'react'
import { AccountContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'
import { SidebarNav } from '@/components/SidebarNav'

export function Sidebar() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-0 h-screen border-r border-border/50 bg-background">
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
        <SidebarNav />
      </div>
    </aside>
  )
}
