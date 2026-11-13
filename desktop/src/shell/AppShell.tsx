import { useContext, type ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Moon, Sun, Wallet } from 'lucide-react'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WindowControls } from '@/components/WindowControls'
import { inTauri } from '@/lib/tauri'
import { cn } from '@/lib/utils'
import { AccountContext, ThemeContext } from './contexts'
import { NAV_ITEMS, navItemFor } from './nav'

const LINK_BASE = 'relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25'

/** The whole frame: a title bar with the four tabs, and the page below it. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useLocation().pathname
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)
  const { theme, toggleTheme } = useContext(ThemeContext)
  const current = navItemFor(pathname)

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <header
          data-tauri-drag-region
          className={cn(
            'flex h-11 shrink-0 items-center gap-2 border-b border-line bg-background/95 px-2 backdrop-blur-sm sm:px-3',
            inTauri && 'pr-[148px] sm:pr-[148px]',
          )}
        >
          <div data-tauri-drag-region className="flex items-center gap-2 pl-1">
            <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Wallet size={13} />
            </span>
            <span data-tauri-drag-region className="hidden text-sm font-semibold tracking-tight sm:inline">
              cibi
            </span>
          </div>

          <nav aria-label="Principal" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {NAV_ITEMS.map(item => {
              const active = item.to === current?.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    LINK_BASE,
                    active ? 'bg-surface-3 font-medium text-foreground' : 'text-muted-foreground hover:bg-surface-2',
                  )}
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div data-tauri-drag-region className="flex-1" />

          <AccountSelector selectedAccountId={selectedAccountId} onSelectAccount={setSelectedAccountId} compact />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Tema</TooltipContent>
          </Tooltip>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
      <WindowControls />
    </TooltipProvider>
  )
}
