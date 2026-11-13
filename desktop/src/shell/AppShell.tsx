import { useContext, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Heart, Moon, Sun } from 'lucide-react'
import { Cat } from '@/components/cats/Cat'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WindowControls } from '@/components/WindowControls'
import { listPaySchedules } from '@/lib/api'
import { meow, purr } from '@/lib/meow'
import { inTauri } from '@/lib/tauri'
import { todayIso } from '@/lib/today'
import { cn } from '@/lib/utils'
import { AccountContext, ThemeContext } from './contexts'
import { EasterEggs } from './EasterEggs'
import { NAV_ITEMS, navItemFor } from './nav'
import { registerPet } from './secrets'

const LINK_BASE = 'squish relative flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25'

/** The logo is a cat. Pet it (click it quickly a few times) and it purrs. On payday it wears a party hat. */
function LogoCat({ accountId }: { accountId: string | null }) {
  const [hearts, setHearts] = useState<{ id: number; dx: number }[]>([])
  const [wiggle, setWiggle] = useState(0)
  const [content, setContent] = useState(false)
  const pets = useRef<number[]>([])
  const today = todayIso()
  const { data: schedules = [] } = useQuery({
    queryKey: ['pay-schedules', accountId],
    queryFn: () => listPaySchedules(accountId!),
    enabled: !!accountId,
  })
  const payday = schedules.some(schedule => schedule.next_payday === today)

  const pet = () => {
    setWiggle(w => w + 1)
    const result = registerPet(pets.current, Date.now())
    pets.current = result.times
    if (!result.purr) return
    purr()
    window.setTimeout(() => meow(1.25, 0.07), 1300)
    setContent(true)
    window.setTimeout(() => setContent(false), 2600)
    const burst = Array.from({ length: 6 }, (_, i) => ({ id: Date.now() + i, dx: (i - 2.5) * 9 }))
    setHearts(burst)
    window.setTimeout(() => setHearts([]), 1800)
  }

  return (
    <button
      type="button"
      onClick={pet}
      aria-label={payday ? 'cibi, hoje é dia de receber!' : 'cibi'}
      title={payday ? 'Hoje é dia de receber! 🎉' : 'cibi'}
      className="relative grid size-8 place-items-center rounded-full bg-blush outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
    >
      <span key={wiggle} className={wiggle > 0 ? 'wiggle' : undefined}>
        <Cat size={26} mood={content ? 'happy' : payday ? 'party' : 'sit'} alive />
      </span>
      {hearts.map(heart => (
        <Heart
          key={heart.id}
          aria-hidden
          size={12}
          className="float-up pointer-events-none absolute top-1 left-1/2 fill-[var(--ink)] text-[var(--ink)]"
          style={{ '--drift': `${heart.dx}px`, animationDelay: `${(heart.id % 6) * 0.08}s`, opacity: 0 } as CSSProperties}
        />
      ))}
    </button>
  )
}

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
            'flex h-12 shrink-0 items-center gap-2 border-b border-line/70 bg-background/80 px-2 backdrop-blur-md sm:px-3',
            inTauri && 'pr-[148px] sm:pr-[148px]',
          )}
        >
          <div data-tauri-drag-region className="flex items-center gap-2 pl-1">
            <LogoCat accountId={selectedAccountId} />
            <span data-tauri-drag-region className="hidden text-base font-extrabold tracking-tight text-primary sm:inline">
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
                    active ? 'bg-blush text-primary shadow-panel' : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
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
      <EasterEggs />
      <WindowControls />
    </TooltipProvider>
  )
}
