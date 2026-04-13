import { useContext } from 'react'
import { Menu } from 'lucide-react'
import { AccountContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 h-14 border-b border-border/50 bg-background/95 backdrop-blur-sm z-40 flex items-center px-4 gap-3">
      <button
        onClick={onMenuClick}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu size={18} />
      </button>

      <span className="text-sm font-semibold tracking-[0.18em] text-foreground flex-1">CIBI</span>

      <AccountSelector
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
      />
    </header>
  )
}
