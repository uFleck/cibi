import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Pencil, Trash2 } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { shortcutRegistry } from '@/hooks/useKeyboardShortcuts'
import { ROW_KEYS } from '@/lib/row-actions'
import { DataList, type DataColumn } from './data-list'

interface Row {
  id: string
  name: string
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
]

const COLUMNS: DataColumn<Row>[] = [{ id: 'name', header: 'Name', cell: row => row.name }]

function renderList(props: Partial<Parameters<typeof DataList<Row>>[0]> & { onEdit?: (id: string) => void; onDelete?: (id: string) => void } = {}) {
  const { onEdit = vi.fn(), onDelete = vi.fn(), ...rest } = props
  render(
    <TooltipProvider>
      <DataList
        rows={ROWS}
        rowId={row => row.id}
        columns={COLUMNS}
        actions={row => [
          { id: 'edit', label: 'Edit', ariaLabel: `Edit ${row.name}`, icon: Pencil, keys: ROW_KEYS.edit, primary: true, run: () => onEdit(row.id) },
          { id: 'delete', label: 'Delete', ariaLabel: `Delete ${row.name}`, icon: Trash2, keys: ROW_KEYS.delete, variant: 'destructive', run: () => onDelete(row.id) },
        ]}
        {...rest}
      />
    </TooltipProvider>,
  )
  return { onEdit, onDelete }
}

describe('DataList', () => {
  let detach: () => void

  beforeEach(() => {
    detach = shortcutRegistry.attach(document)
  })

  afterEach(() => {
    detach()
    cleanup()
  })

  it('never scrolls horizontally: fixed layout, no overflow-x wrapper', () => {
    renderList()
    expect(screen.getByRole('table').className).toContain('table-fixed')
    expect(document.querySelector('.overflow-x-auto')).toBeNull()
  })

  it('keeps action buttons hidden until the row is hovered, focused or selected', () => {
    renderList()
    const actions = screen.getByRole('button', { name: 'Edit Alpha' }).parentElement!
    expect(actions.className).toContain('opacity-0')
    expect(actions.className).toContain('group-hover/row:opacity-100')
    expect(actions.className).toContain('group-focus-within/row:opacity-100')
    expect(actions.className).toContain('group-data-[selected=true]/row:opacity-100')
  })

  it('runs the action of the selected row from its own key, and Enter runs the primary one', () => {
    const { onEdit, onDelete } = renderList()
    fireEvent.click(screen.getByText('Beta'))
    fireEvent.keyDown(document.body, { key: 'd' })
    expect(onDelete).toHaveBeenCalledWith('b')
    fireEvent.keyDown(document.body, { key: 'e' })
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onEdit).toHaveBeenCalledTimes(2)
    expect(onEdit).toHaveBeenCalledWith('b')
  })

  it('does nothing on an action key while no row is selected', () => {
    const { onEdit } = renderList()
    fireEvent.keyDown(document.body, { key: 'e' })
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('moves the selection with j and k and clears it with Escape', () => {
    renderList()
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(document.querySelector('[data-row="a"]')?.getAttribute('data-selected')).toBe('true')
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(document.querySelector('[data-row="b"]')?.getAttribute('data-selected')).toBe('true')
    fireEvent.keyDown(document.body, { key: 'k' })
    expect(document.querySelector('[data-row="a"]')?.getAttribute('data-selected')).toBe('true')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(document.querySelector('[data-selected="true"]')).toBeNull()
  })

  it('shows the empty state instead of an empty table', () => {
    renderList({ rows: [], empty: 'Nothing here' })
    expect(screen.getByText('Nothing here')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('lets only one list per page own the row keys: the one last pointed at', () => {
    const first = vi.fn()
    const second = vi.fn()
    render(
      <TooltipProvider>
        {[first, second].map((onEdit, index) => (
          <DataList
            key={index}
            aria-label={`list ${index}`}
            rows={[{ id: `r${index}`, name: `Row ${index}` }]}
            rowId={row => row.id}
            columns={COLUMNS}
            actions={row => [{ id: 'edit', label: 'Edit', keys: 'e', run: () => onEdit(row.id) }]}
          />
        ))}
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByText('Row 0'))
    fireEvent.keyDown(document.body, { key: 'e' })
    expect(first).toHaveBeenCalledWith('r0')

    fireEvent.pointerDown(screen.getByText('Row 1'))
    fireEvent.click(screen.getByText('Row 1'))
    fireEvent.keyDown(document.body, { key: 'e' })
    expect(second).toHaveBeenCalledWith('r1')
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('does not make read-only lists selectable', () => {
    render(<DataList rows={ROWS} rowId={row => row.id} columns={COLUMNS} />)
    fireEvent.click(screen.getByText('Alpha'))
    expect(document.querySelector('[data-selected="true"]')).toBeNull()
  })
})
