import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountResponse } from '@/lib/api'
import { ShellContext, type ShellState } from '@/shell/contexts'
import { InspectorList } from './InspectorList'
import { LayoutProvider } from './LayoutProvider'
import { useLayout, type LayoutApi } from './layoutContext'
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
  is_default: true,
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

function shellState(editMode: boolean, setEditMode: (on: boolean) => void): ShellState {
  return {
    inspectorOpen: true,
    setInspectorOpen: vi.fn(),
    toggleInspector: vi.fn(),
    editMode,
    setEditMode,
    toggleEditMode: vi.fn(),
  }
}

function renderInspector(editMode = false, setEditMode = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ShellContext.Provider value={shellState(editMode, setEditMode)}>
        <LayoutProvider>
          <Probe>{layout => <InspectorList layout={layout} data={data} />}</Probe>
        </LayoutProvider>
      </ShellContext.Provider>
    </QueryClientProvider>,
  )
}

function stubMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  stubMatchMedia(false)
  apiMock.getSetting.mockResolvedValue(null)
  apiMock.putSetting.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('InspectorList', () => {
  it('explains an empty inspector and opens edit mode from its Add widget button', async () => {
    apiMock.getSetting.mockImplementation(async (key: string) => (key === 'layout.v1' ? { pos: 'right', insp: [] } : null))
    const setEditMode = vi.fn()
    renderInspector(false, setEditMode)

    expect(await screen.findByText('No widgets in the inspector.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }))
    expect(setEditMode).toHaveBeenCalledWith(true)
  })

  it('uses the default sortable transition when reduced motion is not requested', async () => {
    renderInspector()

    expect(await screen.findByText('projection body')).toBeTruthy()
    expect(useSortable).toHaveBeenCalledWith(expect.objectContaining({ id: 'projection' }))
    expect(useSortable).not.toHaveBeenCalledWith(expect.objectContaining({ transition: null }))
  })

  it('turns the sortable transition off when reduced motion is requested', async () => {
    stubMatchMedia(true)
    renderInspector()

    expect(await screen.findByText('projection body')).toBeTruthy()
    expect(useSortable).toHaveBeenCalledWith(expect.objectContaining({ id: 'projection', transition: null }))
  })
})
