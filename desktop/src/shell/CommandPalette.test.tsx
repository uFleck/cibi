import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Calculator, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, type PaletteCommand } from './CommandPalette'
import { fuzzyMatch } from './fuzzy'

function makeCommands() {
  const runTransactions = vi.fn()
  const runNew = vi.fn()
  const runCheck = vi.fn()
  const commands: PaletteCommand[] = [
    { id: 'go-transactions', label: 'Transações', group: 'Ir para', icon: Search, keys: 'g t', run: runTransactions },
    { id: 'new', label: 'Nova transação', group: 'Ações', icon: Plus, keys: 'n', run: runNew },
    { id: 'check', label: 'Posso comprar?', group: 'Ações', icon: Calculator, keys: 'c', run: runCheck },
  ]
  return { commands, runTransactions, runNew, runCheck }
}

function Harness({ commands, onOpenChange }: { commands: PaletteCommand[]; onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <CommandPalette
      open={open}
      commands={commands}
      onOpenChange={next => {
        onOpenChange(next)
        setOpen(next)
      }}
    />
  )
}

function renderPalette(commands: PaletteCommand[], onOpenChange = vi.fn()) {
  render(<Harness commands={commands} onOpenChange={onOpenChange} />)
  return { onOpenChange, input: screen.getByRole('combobox', { name: 'Buscar comandos' }) }
}

describe('CommandPalette', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists every command grouped when the query is empty', () => {
    const { commands } = makeCommands()
    renderPalette(commands)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(screen.getByText('Ir para')).toBeTruthy()
    expect(screen.getAllByText('Ações')).toHaveLength(1)
  })

  it('filters commands with a fuzzy match on the label and group', () => {
    const { commands } = makeCommands()
    const { input } = renderPalette(commands)

    fireEvent.change(input, { target: { value: 'comprar' } })

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('Posso comprar?')
  })

  it('shows an empty state when nothing matches', () => {
    const { commands } = makeCommands()
    const { input } = renderPalette(commands)

    fireEvent.change(input, { target: { value: 'zzzz' } })

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('Nenhum comando encontrado')).toBeTruthy()
  })

  it('moves the selection with the arrow keys and runs it on Enter', async () => {
    const { commands, runNew } = makeCommands()
    const { onOpenChange, input } = renderPalette(commands)

    expect(screen.getByRole('option', { name: /Transações/ }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Nova transação/ }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(runNew).toHaveBeenCalledTimes(1))
  })

  it('runs the command only after the palette has closed', async () => {
    let dialogOpenWhenRun: boolean | null = null
    const run = vi.fn(() => {
      dialogOpenWhenRun = document.querySelector('[role="dialog"]') !== null
    })
    const commands: PaletteCommand[] = [{ id: 'sheet', label: 'Atalhos', group: 'Ajuda',icon: Search, run }]
    const { input } = renderPalette(commands)

    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(dialogOpenWhenRun).toBe(false)
  })

  it('wraps the selection from the first command to the last', () => {
    const { commands } = makeCommands()
    const { input } = renderPalette(commands)

    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(screen.getByRole('option', { name: /Posso comprar/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('runs a command when it is clicked and closes the palette', async () => {
    const { commands, runCheck } = makeCommands()
    const { onOpenChange } = renderPalette(commands)

    fireEvent.click(within(screen.getByRole('listbox')).getByText('Posso comprar?'))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(runCheck).toHaveBeenCalledTimes(1))
  })

  it('closes on Escape', () => {
    const { commands } = makeCommands()
    const { onOpenChange, input } = renderPalette(commands)

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('fuzzyMatch', () => {
  it('matches characters in order, ignoring case and gaps', () => {
    expect(fuzzyMatch('trn', 'Go to Transactions')).toBe(true)
    expect(fuzzyMatch('TRN', 'go to transactions')).toBe(true)
    expect(fuzzyMatch('nrt', 'Transactions')).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(fuzzyMatch('   ', 'anything')).toBe(true)
  })
})
