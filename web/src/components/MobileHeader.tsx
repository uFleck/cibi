import { useContext } from 'react'
import { AccountContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'

export function MobileHeader() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  return (
    <header className="fixed top-0 left-0 right-0 pt-[env(safe-area-inset-top)] border-b border-border/50 bg-background/95 backdrop-blur-sm z-40">
      <div className="h-14 px-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tracking-[0.18em] text-foreground">CIBI</span>
        <AccountSelector
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          compact
        />
      </div>
    </header>
  )
}
