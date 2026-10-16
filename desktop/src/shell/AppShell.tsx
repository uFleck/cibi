import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Calculator, ChevronRight, Keyboard, LayoutGrid, Moon, PanelRight, PieChart, Plus, Search, Sun, Wallet } from 'lucide-react'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { shortcutRegistry, useKeyboardShortcuts, type ShortcutBinding } from '@/hooks/useKeyboardShortcuts'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/utils'
import { AccountContext, ShellContext, ThemeContext, useShell, type ShellState } from './contexts'
import { NAV_ITEMS, navItemFor, type NavTo } from './nav'
import { requestShellAction, type ShellActionName } from './shellActions'
import { ChordPopover } from './ChordPopover'
import { CommandPalette, type PaletteCommand } from './CommandPalette'
import { HintBar, type HintItem } from './HintBar'
import { KeyChips } from './KeyChips'
import { ShortcutsSheet } from './ShortcutsSheet'

const COMPACT_QUERY = '(max-width: 899px)'

const HINT_ITEMS: HintItem[] = [
  { keys: 'Mod+k', label: 'Commands' },
  { keys: 'n', label: 'New' },
  { keys: 'c', label: 'Check' },
  { keys: 'b', label: 'Budget' },
  { keys: '/', label: 'Search' },
  { keys: 'g', label: 'Go to' },
  { keys: '?', label: 'All shortcuts' },
]

const LINK_BASE = 'relative flex items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25'

type ShellAction = PaletteCommand & { keys: string }

interface AppShellProps {
  children: ReactNode
  inspector?: ReactNode
}

export function AppShell({ children, inspector }: AppShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleTheme } = useContext(ThemeContext)
  const compact = useMediaQuery(COMPACT_QUERY)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const pathname = location.pathname

  const toggleInspector = useCallback(() => setInspectorOpen(open => !open), [])
  const toggleEditMode = useCallback(() => setEditMode(on => !on), [])
  const shell = useMemo<ShellState>(() => ({
    inspectorOpen,
    setInspectorOpen,
    toggleInspector,
    editMode,
    setEditMode,
    toggleEditMode,
  }), [inspectorOpen, editMode, toggleInspector, toggleEditMode])

  useEffect(() => shortcutRegistry.attach(document), [])

  function openPage(to: NavTo, action: ShellActionName) {
    if (pathname !== to) void navigate({ to })
    requestShellAction(action)
  }

  const actions: ShellAction[] = [
    ...NAV_ITEMS.map(item => ({
      id: `go-${item.to}`,
      label: item.label,
      group: 'Go to',
      icon: item.icon,
      keys: `g ${item.chord}`,
      run: () => void navigate({ to: item.to }),
    })),
    { id: 'new-transaction', label: 'New transaction', group: 'Actions', icon: Plus, keys: 'n', run: () => openPage('/transactions', 'new-transaction') },
    { id: 'budget', label: 'Monthly budget', group: 'Actions', icon: PieChart, keys: 'b', run: () => toast('Monthly budget is coming soon') },
    { id: 'check', label: 'Can I buy it?', group: 'Actions', icon: Calculator, keys: 'c', run: () => openPage('/', 'focus-check') },
    { id: 'search', label: 'Search transactions', group: 'Actions', icon: Search, keys: '/', run: () => openPage('/transactions', 'focus-search') },
    { id: 'inspector', label: 'Toggle inspector', group: 'View', icon: PanelRight, keys: 'i', run: toggleInspector },
    { id: 'customize', label: 'Customize page', group: 'View', icon: LayoutGrid, keys: 'l', run: toggleEditMode },
    { id: 'theme', label: 'Toggle theme', group: 'View', icon: Moon, keys: 't', run: toggleTheme },
    { id: 'help', label: 'Keyboard shortcuts', group: 'Help', icon: Keyboard, keys: '?', run: () => setHelpOpen(true) },
  ]

  const bindings: ShortcutBinding[] = [
    { keys: 'Mod+k', label: 'Command palette', group: 'Global', allowInInput: true, run: () => setPaletteOpen(open => !open) },
    ...actions.map(action => ({ keys: action.keys, label: action.label, group: action.group, run: action.run })),
  ]
  useKeyboardShortcuts(bindings)

  return (
    <ShellContext.Provider value={shell}>
      <TooltipProvider>
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
          {!compact && <Rail pathname={pathname} />}
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              pathname={pathname}
              onOpenPalette={() => setPaletteOpen(true)}
              onNewTransaction={() => openPage('/transactions', 'new-transaction')}
            />
            <div className="relative flex min-h-0 flex-1">
              <main className="min-w-0 flex-1 overflow-auto max-[899px]:pb-16">{children}</main>
              {inspectorOpen && (
                <aside aria-label="Inspector" className="w-[292px] shrink-0 overflow-auto border-l border-line bg-surface">
                  {inspector}
                </aside>
              )}
              <HintBar items={HINT_ITEMS} hidden={paletteOpen || helpOpen} />
            </div>
          </div>
          {compact && <BottomBar pathname={pathname} />}
        </div>
        <ChordPopover />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={actions} />
        <ShortcutsSheet open={helpOpen} onOpenChange={setHelpOpen} />
      </TooltipProvider>
    </ShellContext.Provider>
  )
}

function NavIndicator() {
  const reduceMotion = useReducedMotion()
  return (
    <motion.span
      layoutId="shell-nav-indicator"
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
      className="absolute inset-0 rounded-md bg-surface-3"
    />
  )
}

function Rail({ pathname }: { pathname: string }) {
  const activeTo = navItemFor(pathname)?.to
  return (
    <aside className="flex w-[52px] shrink-0 flex-col items-center gap-3.5 border-r border-line bg-background py-3">
      <div aria-hidden="true" className="grid size-[34px] place-items-center rounded-md bg-primary text-primary-foreground">
        <Wallet size={17} />
      </div>
      <nav aria-label="Main" className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map(item => {
          const isActive = item.to === activeTo
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(LINK_BASE, 'size-[34px]', isActive ? 'text-foreground' : 'text-faint hover:text-foreground')}
                >
                  {isActive && <NavIndicator />}
                  <item.icon size={18} className="relative" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                {item.label}
                <KeyChips keys={`g ${item.chord}`} inverse />
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </aside>
  )
}

function BottomBar({ pathname }: { pathname: string }) {
  const activeTo = navItemFor(pathname)?.to
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
      {NAV_ITEMS.map(item => {
        const isActive = item.to === activeTo
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(LINK_BASE, 'h-12 flex-1 flex-col gap-0.5 text-[10px] font-medium', isActive ? 'text-foreground' : 'text-faint')}
          >
            {isActive && <NavIndicator />}
            <item.icon size={18} className="relative" />
            <span className="relative max-w-full truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function ShortcutTip({ label, keys, children }: { label: string; keys: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {label}
        <KeyChips keys={keys} inverse />
      </TooltipContent>
    </Tooltip>
  )
}

interface TopBarProps {
  pathname: string
  onOpenPalette: () => void
  onNewTransaction: () => void
}

function TopBar({ pathname, onOpenPalette, onNewTransaction }: TopBarProps) {
  const shell = useShell()
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)
  const { theme, toggleTheme } = useContext(ThemeContext)
  const current = navItemFor(pathname)

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-background/90 px-3 backdrop-blur-sm sm:px-4">
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] text-faint sm:flex">
        <span>cibi</span>
        <ChevronRight size={12} />
        <span className="truncate font-medium text-foreground">{current?.label}</span>
      </nav>
      <AccountSelector selectedAccountId={selectedAccountId} onSelectAccount={setSelectedAccountId} compact />
      <div className="flex-1" />
      <Button
        variant="outline"
        size="sm"
        aria-pressed={shell.editMode}
        onClick={shell.toggleEditMode}
        className={cn(shell.editMode && 'bg-surface-3')}
      >
        <LayoutGrid />
        <span className="max-sm:sr-only">Customize</span>
        <KeyChips keys="l" className="max-sm:hidden" />
      </Button>
      <ShortcutTip label="Toggle inspector" keys="i">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle inspector"
          aria-pressed={shell.inspectorOpen}
          onClick={shell.toggleInspector}
          className={cn(shell.inspectorOpen && 'bg-surface-3')}
        >
          <PanelRight />
        </Button>
      </ShortcutTip>
      <Button
        variant="outline"
        size="sm"
        aria-label="Command palette"
        onClick={onOpenPalette}
        className="h-7 w-7 justify-start gap-2 rounded-full px-0 font-normal text-faint min-[900px]:w-[260px] min-[900px]:px-2.5"
      >
        <Search />
        <span className="hidden min-w-0 truncate min-[900px]:inline">Search or run a command…</span>
        <KeyChips keys="Mod+k" className="ml-auto hidden min-[900px]:inline-flex" />
      </Button>
      <Button size="sm" aria-label="New transaction" onClick={onNewTransaction}>
        <Plus />
        <span className="max-sm:sr-only">New</span>
        <KeyChips keys="n" inverse className="max-sm:hidden" />
      </Button>
      <ShortcutTip label={theme === 'dark' ? 'Light theme' : 'Dark theme'} keys="t">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </ShortcutTip>
    </header>
  )
}
