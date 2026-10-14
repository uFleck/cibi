import { useContext } from 'react'
import { Moon, Sun, Wallet } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AccountContext, ThemeContext } from '@/App'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'

export function MobileHeader() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)
  const { theme, toggleTheme } = useContext(ThemeContext)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] sm:px-4">
      <div className="cibi-floating-nav pointer-events-auto mx-auto h-14 w-full max-w-2xl rounded-2xl border border-border/60 bg-background/90 shadow-lg backdrop-blur-md">
        <div className="flex h-full items-center justify-between gap-2 px-3">
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">CIBI</span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <AccountSelector
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
              compact
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Manage accounts"
              title="Manage accounts"
              asChild
            >
              <Link to="/accounts">
                <Wallet size={18} />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
