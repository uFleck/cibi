import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountResponse } from '@/lib/api'
import { ShellContext, type ShellState } from '@/shell/contexts'
import { LayoutProvider } from './LayoutProvider'
import { useLayout, type LayoutApi } from './layoutContext'
import { WallGrid } from './WallGrid'
import type { WidgetData } from './useWorkspace'

const apiMock = vi.hoisted(() => ({ getSetting: vi.fn(), putSetting: vi.fn() }))

vi.mock('@/lib/api', () => apiMock)

vi.mock('@dnd-kit/sortable', async importOriginal => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>()
  return { ...actual, useSortable: vi.fn(actual.useSortable) }
})

vi.mock('@/widgets/registry', async () => {
  const { WIDGET_IDS, WIDGET_META, WALL_SPANS } = await import('@/widgets/meta')
  const { createElement } = await import('react')
  const WIDGETS = Object.fromEntries(
    WIDGET_IDS.map(id => [
      id,
      { meta: WIDGET_META[id], spans: WALL_SPANS, component: () => createElement('p', null, `${id} body`) },
    ]),
  )
  return { WIDGETS }
})

const account: AccountResponse = {
  id: 'a1',
  name: 'Main',
  current_balance: 100,
  currency: 'BRL',
  safety_buffer: 0,
}

const data: WidgetData = {
  account,
  accounts: [account],
  transactions: [],
  paySchedules: [],
  friendBreakdown: [],
  nextPayday: null,
}

function Probe({ children }: { children: (layout: LayoutApi) => ReactNode }) {
  const layout = useLayout()
  return layout ? <>{children(layout)}</> : null
}

function shellState(editMode: boolean, setEditMode: (on: boolean) => void = vi.fn()): ShellState {
  return {
    inspectorOpen: false,
    setInspectorOpen: vi.fn(),
    toggleInspector: vi.fn(),
    editMode,
    setEditMode,
    toggleEditMode: vi.fn(),
  }
}

function renderWall(editMode = true, setEditMode?: (on: boolean) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ShellContext.Provider value={shellState(editMode, setEditMode)}>
        <LayoutProvider>
          <Probe>{layout => <WallGrid layout={layout} data={data} />}</Probe>
        </LayoutProvider>
      </ShellContext.Provider>
    </QueryClientProvider>,
  )
}

const frame = (id: string) => document.querySelector<HTMLElement>(`[data-widget-frame="${id}"]`)
const frameIds = () => Array.from(document.querySelectorAll<HTMLElement>('[data-widget-frame]')).map(el => el.dataset.widgetFrame)

async function renderLoaded(editMode = true, setEditMode?: (on: boolean) => void) {
  renderWall(editMode, setEditMode)
  await waitFor(() => expect(frameIds()).toHaveLength(11))
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(min-width: 1100px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  apiMock.getSetting.mockResolvedValue(null)
  apiMock.putSetting.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('WallGrid', () => {
  it('renders the W1 Balanced wall with each widget once, in preset order', async () => {
    await renderLoaded()
    expect(frameIds()).toEqual([
      'kpis', 'projection', 'check', 'budget', 'upcoming', 'recent',
      'categories', 'payday', 'goals', 'accounts', 'friends',
    ])
    expect(frame('kpis')?.parentElement?.style.gridColumn).toBe('span 12 / span 12')
  })

  it('Alt+ArrowRight moves the focused widget one place later and keeps focus on it', async () => {
    await renderLoaded()
    fireEvent.keyDown(frame('kpis')!, { key: 'ArrowRight', altKey: true })
    expect(frameIds().slice(0, 2)).toEqual(['projection', 'kpis'])
    expect(document.activeElement).toBe(frame('kpis'))
  })

  it('Alt+ArrowLeft at the start of the wall stays put', async () => {
    await renderLoaded()
    fireEvent.keyDown(frame('kpis')!, { key: 'ArrowLeft', altKey: true })
    expect(frameIds()[0]).toBe('kpis')
  })

  it('Alt+Shift+ArrowLeft steps the span down the allowed list', async () => {
    await renderLoaded()
    fireEvent.keyDown(frame('kpis')!, { key: 'ArrowLeft', altKey: true, shiftKey: true })
    expect(frame('kpis')?.parentElement?.style.gridColumn).toBe('span 8 / span 8')
    expect(within(frame('kpis')!).getByRole('button', { name: 'XL', pressed: true })).toBeTruthy()
  })

  it('Alt+Shift+ArrowRight at the full width stays at 12', async () => {
    await renderLoaded()
    fireEvent.keyDown(frame('kpis')!, { key: 'ArrowRight', altKey: true, shiftKey: true })
    expect(frame('kpis')?.parentElement?.style.gridColumn).toBe('span 12 / span 12')
  })

  it('Delete removes the focused widget from the wall', async () => {
    await renderLoaded()
    fireEvent.keyDown(frame('recent')!, { key: 'Delete' })
    expect(frame('recent')).toBeNull()
    expect(frameIds()).toHaveLength(10)
  })

  it('Delete moves focus to the next widget, so keyboard focus is not lost', async () => {
    await renderLoaded()
    frame('recent')!.focus()
    fireEvent.keyDown(frame('recent')!, { key: 'Delete' })
    expect(document.activeElement).toBe(frame('categories'))
  })

  it('removing the last widget moves focus to its tray chip, since there is no next widget', async () => {
    await renderLoaded()
    frame('friends')!.focus()
    fireEvent.keyDown(frame('friends')!, { key: 'Delete' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Friend ledger' }))
  })

  it('the Remove button moves focus to the next widget', async () => {
    await renderLoaded()
    fireEvent.click(within(frame('kpis')!).getByRole('button', { name: 'Remove Key figures' }))
    expect(document.activeElement).toBe(frame('projection'))
  })

  it('ignores the keyboard path outside edit mode', async () => {
    await renderLoaded(false)
    expect(frame('kpis')?.getAttribute('tabindex')).toBeNull()
    fireEvent.keyDown(frame('kpis')!, { key: 'Delete' })
    expect(frame('kpis')).not.toBeNull()
  })

  it('removes a widget from the wall and offers it in the tray', async () => {
    await renderLoaded()
    fireEvent.click(within(frame('projection')!).getByRole('button', { name: 'Remove Projection' }))
    expect(frame('projection')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Projection' }))
    expect(frameIds().at(-1)).toBe('projection')
  })

  it('applies a preset from the edit bar', async () => {
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'W2 Projection' }))
    expect(frameIds().slice(0, 2)).toEqual(['kpis', 'projection'])
    expect(frameIds()).toHaveLength(11)
    expect(screen.getByRole('button', { name: 'W2 Projection', pressed: true })).toBeTruthy()
  })

  it('Reset returns the wall to the last applied preset after an edit', async () => {
    await renderLoaded()
    fireEvent.keyDown(frame('kpis')!, { key: 'Delete' })
    expect(frameIds()).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(frameIds()).toHaveLength(11)
    expect(frameIds()[0]).toBe('kpis')
  })

  it('Done leaves edit mode', async () => {
    const setEditMode = vi.fn()
    await renderLoaded(true, setEditMode)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(setEditMode).toHaveBeenCalledWith(false)
  })

  it('explains an empty wall and opens edit mode from its Add widget button', async () => {
    apiMock.getSetting.mockImplementation(async (key: string) => (key === 'layout.v1' ? { pos: 'right', wall: [], insp: [] } : null))
    const setEditMode = vi.fn()
    renderWall(false, setEditMode)

    expect(await screen.findByText('No widgets on this wall.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }))
    expect(setEditMode).toHaveBeenCalledWith(true)
  })
})

describe('WallGrid sortable transitions', () => {
  it('uses the default transition when reduced motion is not requested', async () => {
    await renderLoaded()
    expect(useSortable).toHaveBeenCalledWith(expect.objectContaining({ id: 'kpis' }))
    expect(useSortable).not.toHaveBeenCalledWith(expect.objectContaining({ transition: null }))
  })

  it('turns the sortable transition off when reduced motion is requested', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 1100px)' || query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    await renderLoaded()
    expect(useSortable).toHaveBeenCalledWith(expect.objectContaining({ id: 'kpis', transition: null }))
  })
})
