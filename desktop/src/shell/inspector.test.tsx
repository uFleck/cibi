import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LayoutProvider } from '@/widgets/LayoutProvider'
import { LAYOUT_KEY } from '@/widgets/layoutStore'
import { AppShell } from './AppShell'
import { usePublishSelection, useListSelection, type SelectionDetail } from './selection'

const store = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }))

vi.mock('@/lib/api', () => ({
  fetchAccounts: vi.fn(async () => [
    { id: 'acct-1', name: 'Main', current_balance: 1000, currency: 'BRL', safety_buffer: 0 },
  ]),
  fetchTransactions: vi.fn(async () => []),
  listPaySchedules: vi.fn(async () => []),
  fetchFriendBreakdown: vi.fn(async () => []),
  getSetting: vi.fn(async (key: string) => store.settings[key] ?? null),
  putSetting: vi.fn(async () => undefined),
}))

vi.mock('@/widgets/registry', async () => {
  const { WIDGET_IDS, WIDGET_META } = await import('@/widgets/meta')
  return {
    WIDGETS: Object.fromEntries(WIDGET_IDS.map(id => [id, {
      meta: WIDGET_META[id],
      spans: [3, 4, 6, 8, 12],
      component: () => <p>{`body ${id}`}</p>,
    }])),
  }
})

const ROWS = ['a', 'b', 'c']
const calls = { edit: [] as string[], paid: [] as string[] }

function RowsPage() {
  const { selectedId, select } = useListSelection({
    ids: ROWS,
    actionsFor: id => [
      { id: 'edit', label: 'Edit', keys: 'e', primary: true, run: () => calls.edit.push(id) },
      { id: 'paid', label: 'Mark paid', keys: 'm', run: () => calls.paid.push(id) },
    ],
  })
  const detail: SelectionDetail | null = selectedId
    ? {
        id: selectedId,
        title: `Detail ${selectedId}`,
        eyebrow: 'Due 20/10',
        amount: 'R$ 10,00',
        rows: [{ label: 'Account', value: 'Main' }],
        actions: [{ id: 'edit', label: 'Edit', keys: 'e', run: () => calls.edit.push(selectedId) }],
      }
    : null
  usePublishSelection(detail)
  return (
    <div>
      {ROWS.map(id => (
        <div key={id} data-row={id} onClick={() => select(id)}>{`Item ${id}`}</div>
      ))}
    </div>
  )
}

function EmptyPage() {
  useListSelection({ ids: [] })
  return <p>Empty list</p>
}

function mockViewport({ wide, compact }: { wide: boolean; compact: boolean }) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: (compact && query === '(max-width: 899px)') || (wide && query === '(min-width: 1100px)'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function renderShell(path: string, viewport = { wide: true, compact: false }) {
  mockViewport(viewport)
  const rootRoute = createRootRoute({
    component: () => (
      <LayoutProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </LayoutProvider>
    ),
  })
  const pages = { '/': RowsPage, '/transactions': RowsPage, '/empty': EmptyPage }
  const routes = Object.entries(pages).map(([routePath, component]) => createRoute({
    getParentRoute: () => rootRoute,
    path: routePath,
    component,
  }))
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, ...init })
}

function inspector() {
  return screen.queryByRole('complementary', { name: 'Inspector' })
}

/** True when the inspector sits before the page content in the DOM (left column). */
function inspectorBeforeMain() {
  const aside = inspector()
  const main = screen.getByRole('main')
  return aside !== null && (aside.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('inspector and row selection', () => {
  beforeEach(() => {
    store.settings = {}
    calls.edit.length = 0
    calls.paid.length = 0
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows the saved inspector widgets in their saved order', async () => {
    store.settings[LAYOUT_KEY] = { pos: 'right', wall: [], insp: [{ id: 'goals' }, { id: 'payday' }] }
    renderShell('/transactions')

    const aside = await screen.findByRole('complementary', { name: 'Inspector' })
    await within(aside).findByText('body goals')
    const goals = within(aside).getByText('body goals')
    const payday = within(aside).getByText('body payday')
    expect(goals.compareDocumentPosition(payday) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  it('places the inspector column on the saved side', async () => {
    store.settings[LAYOUT_KEY] = { pos: 'left', wall: [], insp: [{ id: 'payday' }] }
    renderShell('/transactions')

    await waitFor(() => expect(inspectorBeforeMain()).toBe(true))
  })

  it('hides the column for position off and opens a drawer with I', async () => {
    store.settings[LAYOUT_KEY] = { pos: 'off', wall: [], insp: [{ id: 'payday' }] }
    renderShell('/transactions')

    await screen.findByRole('complementary', { name: 'Inspector' })
    await waitFor(() => expect(inspector()).toBeNull())
    press('i')
    expect(await screen.findByRole('button', { name: 'Close inspector' })).toBeTruthy()
    expect(inspector()).not.toBeNull()
  })

  it('edits the inspector zone from Customize on a non-overview page', async () => {
    store.settings[LAYOUT_KEY] = { pos: 'right', wall: [], insp: [{ id: 'payday' }] }
    renderShell('/transactions')
    await screen.findByRole('complementary', { name: 'Inspector' })

    press('l')
    expect(await screen.findByText('Customize inspector')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Left' }))

    await waitFor(() => expect(inspectorBeforeMain()).toBe(true))
  })

  it('never shows the inspector column on Overview', async () => {
    store.settings[LAYOUT_KEY] = { pos: 'right', wall: [], insp: [{ id: 'payday' }] }
    renderShell('/')

    await screen.findByText('Item a')
    expect(inspector()).toBeNull()
  })

  it('moves the selection with J and K and shows the selected row in the inspector', async () => {
    renderShell('/transactions')
    await screen.findByText('Item a')

    press('j')
    expect(await screen.findByText('Detail a')).toBeTruthy()
    press('j')
    expect(await screen.findByText('Detail b')).toBeTruthy()
    press('k')
    expect(await screen.findByText('Detail a')).toBeTruthy()
  })

  it('selects a row on click and clears the selection with Escape', async () => {
    renderShell('/transactions')

    fireEvent.click(await screen.findByText('Item c'))
    expect(await screen.findByText('Detail c')).toBeTruthy()

    press('Escape')
    await waitFor(() => expect(screen.queryByText('Detail c')).toBeNull())
  })

  it('runs Edit with E and Mark paid with M on the selected row', async () => {
    renderShell('/transactions')
    await screen.findByText('Item a')

    press('j')
    await screen.findByText('Detail a')
    press('e')
    press('m')

    expect(calls.edit).toEqual(['a'])
    expect(calls.paid).toEqual(['a'])
  })

  it('starts the inspector closed on a narrow window', async () => {
    renderShell('/transactions', { wide: false, compact: false })

    await screen.findByText('Item a')
    expect(inspector()).toBeNull()
  })

  it('shows the selected row detail with its actions when the inspector is off', async () => {
    store.settings[LAYOUT_KEY] = { pos: 'off', wall: [], insp: [{ id: 'payday' }] }
    renderShell('/transactions')
    await screen.findByRole('complementary', { name: 'Inspector' })
    await waitFor(() => expect(inspector()).toBeNull())

    fireEvent.click(screen.getByText('Item b'))
    const aside = await screen.findByRole('complementary', { name: 'Inspector' })
    expect(await within(aside).findByText('Detail b')).toBeTruthy()
    expect(within(aside).getByRole('button', { name: /edit/i })).toBeTruthy()

    press('Escape')
    await waitFor(() => expect(inspector()).toBeNull())
  })

  it('leaves arrow keys alone when the list is empty', async () => {
    renderShell('/empty')
    await screen.findByText('Empty list')

    expect(fireEvent.keyDown(document.body, { key: 'ArrowDown' })).toBe(true)
    expect(fireEvent.keyDown(document.body, { key: 'j' })).toBe(true)
  })

  it('prevents the default for arrow keys when the list has rows', async () => {
    renderShell('/transactions')
    await screen.findByText('Item a')

    expect(fireEvent.keyDown(document.body, { key: 'ArrowDown' })).toBe(false)
  })

  it('opens the detail as a drawer on Overview and closes it with Escape', async () => {
    renderShell('/')
    await screen.findByText('Item b')
    expect(inspector()).toBeNull()

    fireEvent.click(screen.getByText('Item b'))
    expect(await within(await screen.findByRole('complementary', { name: 'Inspector' })).findByText('Detail b')).toBeTruthy()

    press('Escape')
    await waitFor(() => expect(inspector()).toBeNull())
  })
})
