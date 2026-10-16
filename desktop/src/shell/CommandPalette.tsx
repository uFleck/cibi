import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import { KeyChips } from './KeyChips'
import { fuzzyMatch } from './fuzzy'

export interface PaletteCommand {
  id: string
  label: string
  group: string
  icon: LucideIcon
  keys?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: PaletteCommand[]
}

export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const pending = useRef<PaletteCommand | null>(null)

  function runCommand(command: PaletteCommand) {
    pending.current = command
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={event => {
          const command = pending.current
          if (!command) return
          pending.current = null
          event.preventDefault()
          command.run()
        }}
        className="inset-x-3 top-[12%] bottom-auto w-auto translate-y-0 gap-0 overflow-hidden rounded-over p-0 sm:top-[18%] sm:w-full sm:max-w-[560px] sm:translate-y-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search pages and actions</DialogDescription>
        <PaletteBody commands={commands} onRun={runCommand} />
      </DialogContent>
    </Dialog>
  )
}

interface PaletteBodyProps {
  commands: PaletteCommand[]
  onRun: (command: PaletteCommand) => void
}

function PaletteBody({ commands, onRun }: PaletteBodyProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const matches = useMemo(
    () => commands.filter(command => fuzzyMatch(query, `${command.group} ${command.label}`)),
    [commands, query],
  )
  const index = matches.length > 0 ? Math.min(active, matches.length - 1) : 0

  useEffect(() => {
    document.getElementById(`palette-option-${index}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [index])

  function move(delta: number) {
    if (matches.length === 0) return
    setActive((index + delta + matches.length) % matches.length)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = matches[index]
      if (command) onRun(command)
    }
  }

  return (
    <>
      <div className="flex h-12 items-center gap-2.5 border-b border-line px-3.5">
        <Search size={16} className="shrink-0 text-faint" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={matches.length > 0 ? `palette-option-${index}` : undefined}
          aria-label="Search commands"
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a command or search…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div id="command-palette-list" role="listbox" aria-label="Commands" className="max-h-[360px] overflow-auto p-1.5">
        {matches.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-faint">No matching commands</div>
        )}
        {matches.map((command, position) => (
          <div key={command.id}>
            {(position === 0 || matches[position - 1].group !== command.group) && (
              <div role="presentation" className="px-2.5 pt-2 pb-1 font-mono text-[10px] tracking-wider text-faint uppercase">
                {command.group}
              </div>
            )}
            <div
              id={`palette-option-${position}`}
              role="option"
              aria-selected={position === index}
              onMouseMove={() => setActive(position)}
              onClick={() => onRun(command)}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm',
                position === index ? 'bg-surface-3 text-foreground' : 'text-muted-foreground',
              )}
            >
              <command.icon size={15} className="shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">{command.label}</span>
              {command.keys && <KeyChips keys={command.keys} />}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 border-t border-line px-3.5 py-2 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1.5"><KeyChips keys="ArrowUp" />/<KeyChips keys="ArrowDown" />navigate</span>
        <span className="inline-flex items-center gap-1.5"><KeyChips keys="Enter" />run</span>
        <span className="inline-flex items-center gap-1.5"><KeyChips keys="Escape" />close</span>
      </div>
    </>
  )
}
