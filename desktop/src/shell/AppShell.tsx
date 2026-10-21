import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Calculator, ChevronRight, Keyboard, LayoutGrid, Moon, PanelRight, PieChart, Plus, Search, Sun, Wallet, X } from 'lucide-react'
import { AccountSelector } from '@/components/AccountSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { shortcutRegistry, useKeyboardShortcuts, type ShortcutBinding } from '@/hooks/useKeyboardShortcuts'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useLayout } from '@/widgets/layoutContext'
import { DEFAULT_POS, type InspectorPos } from '@/widgets/layoutStore'
import { cn } from '@/lib/utils'
import { BudgetEditor } from '@/widgets/budget/BudgetEditor'
import { AccountContext, ShellContext, ThemeContext, useShell, type ShellState } from './contexts'
import { Inspector } from './Inspector'
import { NAV_ITEMS, navItemFor, type NavTo } from './nav'
import { requestShellAction, type ShellActionName } from './shellActions'
import { SelectionProvider } from './SelectionProvider'
import { SelectionDetailContext, useSelection } from './selection'
import { ChordPopover } from './ChordPopover'
import { CommandPalette, type PaletteCommand } from './CommandPalette'
import { HintBar, type HintItem } from './HintBar'
import { KeyChips } from '@/components/ui/key-chips'
import { ShortcutsSheet } from './ShortcutsSheet'
import { WindowControls, inTauri } from '@/components/WindowControls'

const COMPACT_QUERY = '(max-width: 899px)'
const WIDE_QUERY = '(min-width: 1100px)'

const HINT_ITEMS: HintItem[] = [
  { keys: 'Mod+k', label: 'Comandos' },
  { keys: 'n', label: 'Nova' },
  { keys: 'c', label: 'Posso comprar?' },
  { keys: 'b', label: 'Orçamento' },
  { keys: '/', label: 'Buscar' },
  { keys: 'g', label: 'Ir para' },
  { keys: '?', label: 'Todos os atalhos' },
]

const HINTS_COLLAPSED_STORAGE_KEY = 'cibi.hintbar.collapsed'

function readHintsCollapsed(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(HINTS_COLLAPSED_STORAGE_KEY) !== '0'
}

const LINK_BASE = 'relative flex items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25'

type ShellAction = PaletteCommand & { keys: string }

interface AppShellProps {
  children: ReactNode
}

/**
 * Shell frame for every page. The inspector is a column on non-Overview pages when the window is at
 * least 1100px wide and the position is left or right; it is open by default there. Otherwise it is a
 * drawer that starts closed. A selected row's detail always shows, in the drawer if no column is visible.
 * Overview never shows the column.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = useLocation().pathname
  return (
    <SelectionProvider resetKey={pathname}>
      <ShellFrame pathname={pathname}>{children}</ShellFrame>
    </SelectionProvider>
  )
}

function ShellFrame({ pathname, children }: { pathname: string; children: ReactNode }) {
  const navigate = useNavigate()
  const { toggleTheme } = useContext(ThemeContext)
  const compact = useMediaQuery(COMPACT_QUERY)
  const wide = useMediaQuery(WIDE_QUERY)
  const layout = useLayout()
  const pos: InspectorPos = layout?.state.layout.pos ?? DEFAULT_POS
  // The home page and the widget wall have no selection to inspect.
  const isOverview = pathname === '/' || pathname === '/widgets'
  const { selectedId, select } = useSelection()
  const detail = useContext(SelectionDetailContext)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [inspectorState, setInspectorState] = useState<boolean | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [hintsCollapsed, setHintsCollapsedState] = useState(readHintsCollapsed)

  const setHintsCollapsed = useCallback((collapsed: boolean) => {
    setHintsCollapsedState(collapsed)
    window.localStorage.setItem(HINTS_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  }, [])

  const inspectorOpen = inspectorState ?? (pos !== 'off' && wide)
  const column = !isOverview && wide && pos !== 'off' && inspectorOpen
  const detailShown = selectedId !== null && detail !== null
  const drawer = !column && (detailShown || (!isOverview && inspectorOpen))

  const setInspectorOpen = useCallback((open: boolean) => setInspectorState(open), [])
  const toggleInspector = useCallback(() => setInspectorState(!inspectorOpen), [inspectorOpen])

  const setEdit = useCallback((on: boolean) => {
    setEditMode(on)
    if (on) {
      select(null)
      if (!isOverview) setInspectorState(true)
    } else if (!isOverview && pos === 'off') {
      setInspectorState(false)
    }
  }, [isOverview, pos, select])
  const toggleEditMode = useCallback(() => setEdit(!editMode), [editMode, setEdit])

  const shell = useMemo<ShellState>(() => ({
    inspectorOpen,
    setInspectorOpen,
    toggleInspector,
    editMode,
    setEditMode: setEdit,
    toggleEditMode,
  }), [inspectorOpen, editMode, setInspectorOpen, toggleInspector, setEdit, toggleEditMode])

  useEffect(() => shortcutRegistry.attach(document), [])

  function closeDrawer() {
    select(null)
    setInspectorOpen(false)
  }

  function openPage(to: NavTo, action: ShellActionName) {
    if (pathname !== to) void navigate({ to })
    requestShellAction(action)
  }

  const actions: ShellAction[] = [
    ...NAV_ITEMS.map(item => ({
      id: `go-${item.to}`,
      label: item.label,
      group: 'Ir para',
      icon: item.icon,
      keys: `g ${item.chord}`,
      run: () => void navigate({ to: item.to }),
    })),
    { id: 'new-transaction', label: 'Nova transação', group: 'Ações', icon: Plus, keys: 'n', run: () => openPage('/transactions', 'new-transaction') },
    { id: 'budget', label: 'Orçamento do mês', group: 'Ações', icon: PieChart, keys: 'b', run: () => openPage('/widgets', 'open-budget') },
    { id: 'check', label: 'Posso comprar?', group: 'Ações', icon: Calculator, keys: 'c', run: () => openPage('/widgets', 'focus-check') },
    { id: 'search', label: 'Buscar transações', group: 'Ações', icon: Search, keys: '/', run: () => openPage('/transactions', 'focus-search') },
    { id: 'inspector', label: 'Alternar detalhes', group: 'Exibição', icon: PanelRight, keys: 'i', run: toggleInspector },
    { id: 'customize', label: 'Personalizar página', group: 'Exibição', icon: LayoutGrid, keys: 'l', run: toggleEditMode },
    { id: 'theme', label: 'Alternar tema', group: 'Exibição', icon: Moon, keys: 't', run: toggleTheme },
    { id: 'hints', label: 'Alternar dicas de atalho', group: 'Exibição', icon: Keyboard, keys: 'h', run: () => setHintsCollapsed(!hintsCollapsed) },
    { id: 'help', label: 'Atalhos de teclado', group: 'Ajuda', icon: Keyboard, keys: '?', run: () => setHelpOpen(true) },
  ]

  const bindings: ShortcutBinding[] = [
    { keys: 'Mod+k', label: 'Paleta de comandos', group: 'Geral', allowInInput: true, run: () => setPaletteOpen(open => !open) },
    { keys: 'Escape', label: 'Limpar seleção ou fechar detalhes', group: 'Geral', run: () => {
      if (selectedId !== null) select(null)
      else if (drawer && !isOverview) setInspectorOpen(false)
    } },
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
              {column && pos === 'left' && <InspectorColumn side="left" />}
              <main className="min-w-0 flex-1 overflow-auto max-[899px]:pb-16">{children}</main>
              {column && pos === 'right' && <InspectorColumn side="right" />}
              {drawer && <InspectorDrawer onClose={closeDrawer} />}
              <HintBar items={HINT_ITEMS} hidden={paletteOpen || helpOpen} collapsed={hintsCollapsed} onCollapsedChange={setHintsCollapsed} />
            </div>
          </div>
          {compact && <BottomBar pathname={pathname} />}
        </div>
        <WindowControls />
        <ChordPopover />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={actions} />
        <BudgetEditor />
        <ShortcutsSheet open={helpOpen} onOpenChange={setHelpOpen} />
      </TooltipProvider>
    </ShellContext.Provider>
  )
}

function InspectorColumn({ side }: { side: 'left' | 'right' }) {
  return (
    <aside
      aria-label="Detalhes"
      className={cn('w-[292px] shrink-0 overflow-auto bg-surface p-3', side === 'left' ? 'border-r border-line' : 'border-l border-line')}
    >
      <Inspector />
    </aside>
  )
}

function InspectorDrawer({ onClose }: { onClose: () => void }) {
  return (
    <aside
      aria-label="Detalhes"
      className="fixed top-11 right-0 bottom-0 z-30 w-[360px] max-w-full overflow-auto border-l border-line bg-surface p-3 shadow-pop animate-in duration-300 slide-in-from-right"
    >
      <div className="mb-2 flex justify-end">
        <Button variant="ghost" size="icon-sm" aria-label="Fechar detalhes" onClick={onClose}>
          <X />
        </Button>
      </div>
      <Inspector />
    </aside>
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
    <aside data-tauri-drag-region className="flex w-[52px] shrink-0 flex-col items-center gap-3.5 border-r border-line bg-background py-3">
      <div aria-hidden="true" data-tauri-drag-region className="grid size-[34px] place-items-center rounded-md bg-primary text-primary-foreground">
        <Wallet size={17} />
      </div>
      <nav aria-label="Principal" className="flex flex-col items-center gap-1">
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
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
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
    <header
      data-tauri-drag-region
      className={cn(
        'flex h-11 shrink-0 items-center gap-2 border-b border-line bg-background/90 px-3 backdrop-blur-sm sm:px-4',
        inTauri && 'pr-[150px] sm:pr-[154px]',
      )}
    >
      <nav aria-label="Caminho" data-tauri-drag-region className="hidden min-w-0 items-center gap-1.5 text-[13px] text-faint sm:flex">
        <span data-tauri-drag-region>cibi</span>
        <ChevronRight size={12} className="pointer-events-none" />
        <span data-tauri-drag-region className="truncate font-medium text-foreground">{current?.label}</span>
      </nav>
      <AccountSelector selectedAccountId={selectedAccountId} onSelectAccount={setSelectedAccountId} compact />
      <div data-tauri-drag-region className="flex-1" />
      <Button
        variant="outline"
        size="sm"
        aria-pressed={shell.editMode}
        onClick={shell.toggleEditMode}
        className={cn(shell.editMode && 'bg-surface-3')}
      >
        <LayoutGrid />
        <span className="max-sm:sr-only">Personalizar</span>
        <KeyChips keys="l" className="max-sm:hidden" />
      </Button>
      <ShortcutTip label="Alternar detalhes" keys="i">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Alternar detalhes"
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
        aria-label="Paleta de comandos"
        onClick={onOpenPalette}
        className="h-7 w-7 justify-start gap-2 rounded-full px-0 font-normal text-faint min-[900px]:w-[260px] min-[900px]:px-2.5"
      >
        <Search />
        <span className="hidden min-w-0 truncate min-[900px]:inline">Buscar ou executar um comando…</span>
        <KeyChips keys="Mod+k" className="ml-auto hidden min-[900px]:inline-flex" />
      </Button>
      <Button size="sm" aria-label="Nova transação" onClick={onNewTransaction}>
        <Plus />
        <span className="max-sm:sr-only">Nova</span>
        <KeyChips keys="n" inverse className="max-sm:hidden" />
      </Button>
      <ShortcutTip label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} keys="t">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </ShortcutTip>
    </header>
  )
}
