import { useContext } from 'react'
import { Menu } from 'lucide-react'
import { AccountContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 pt-[env(safe-area-inset-top)] border-b border-border/50 bg-background/95 backdrop-blur-sm z-40">
      <div className="h-14 px-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="size-11"
        >
          <Menu size={20} />
        </Button>

        <span className="text-sm font-semibold tracking-[0.18em] text-foreground flex-1">CIBI</span>
      </div>

      <div className="px-4 pb-3">
        <AccountSelector
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          fullWidth
        />
      </div>
    </header>
  )
}
