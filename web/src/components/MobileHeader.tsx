import { useContext } from 'react'
import { AccountContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'

export function MobileHeader() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] sm:px-4">
      <div className="cibi-floating-nav pointer-events-auto mx-auto h-14 w-full max-w-2xl rounded-2xl border border-border/60 bg-background/90 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="flex h-full items-center justify-between gap-3 px-4">
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">CIBI</span>
          <AccountSelector
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            compact
          />
        </div>
      </div>
    </header>
  )
}
