import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('@/lib/api', () => ({ fetchAccounts: vi.fn(async () => []) }))

const PATHS = ['/', '/transactions', '/goals', '/friends', '/accounts', '/settings'] as const

function mockViewport(compact: boolean, wide = false) {
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

function renderShell(path: string = '/', compact = false, wide = false) {
  mockViewport(compact, wide)
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  })
  const routes = PATHS.map(routePath => createRoute({
    getParentRoute: () => rootRoute,
    path: routePath,
    component: () => <p>Page {routePath}</p>,
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
  return router
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, ...init })
}

describe('AppShell', () => {
  beforeEach(() => {
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

  it('marks the current page in the rail', async () => {
    renderShell('/transactions')

    const transactionsLink = await screen.findByRole('link', { name: 'Transactions' })
    expect(transactionsLink.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Goals' }).getAttribute('aria-current')).toBeNull()
  })

  it('navigates when a rail link is clicked', async () => {
    renderShell('/')

    fireEvent.click(await screen.findByRole('link', { name: 'Goals' }))

    expect(await screen.findByText('Page /goals')).toBeTruthy()
  })

  it('goes to a page with the G chord and shows the chord hint while pending', async () => {
    renderShell('/')
    await screen.findByRole('link', { name: 'Overview' })

    press('g')

    expect(screen.getByRole('status').textContent).toContain('Settings')
    press('s')

    expect(await screen.findByText('Page /settings')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('opens the command palette with Ctrl+K', async () => {
    renderShell('/')
    await screen.findByRole('link', { name: 'Overview' })

    press('k', { ctrlKey: true })

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })

  it('opens the keyboard shortcuts sheet with ?', async () => {
    renderShell('/')
    await screen.findByRole('link', { name: 'Overview' })

    press('?')

    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })

  it('toggles the inspector column with I on a non-overview page', async () => {
    renderShell('/transactions', false, true)
    await screen.findByRole('link', { name: 'Transactions' })
    expect(await screen.findByRole('complementary', { name: 'Inspector' })).toBeTruthy()

    press('i')
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull()

    press('i')
    expect(await screen.findByRole('complementary', { name: 'Inspector' })).toBeTruthy()
  })

  it('never shows the inspector column on Overview', async () => {
    renderShell('/', false, true)
    await screen.findByRole('link', { name: 'Overview' })

    press('i')
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull()
  })

  it('navigates to transactions from the New button on another page', async () => {
    const router = renderShell('/')

    fireEvent.click(await screen.findByRole('button', { name: 'New transaction' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/transactions'))
  })

  it('opens the monthly budget with B from another page', async () => {
    const router = renderShell('/transactions')
    await screen.findByRole('link', { name: 'Transactions' })

    press('b')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('dialog', { name: 'Monthly budget' })).toBeTruthy()
  })

  it('collapses the hint bar to a pill, restores it, and remembers the choice', async () => {
    window.localStorage.removeItem('cibi.hintbar.collapsed')
    renderShell('/')
    await screen.findByRole('link', { name: 'Overview' })
    expect(screen.getByRole('note', { name: 'Keyboard hints' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Hide keyboard hints' }))
    expect(screen.queryByRole('note', { name: 'Keyboard hints' })).toBeNull()
    expect(window.localStorage.getItem('cibi.hintbar.collapsed')).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Show keyboard hints' }))
    expect(screen.getByRole('note', { name: 'Keyboard hints' })).toBeTruthy()
    expect(window.localStorage.getItem('cibi.hintbar.collapsed')).toBe('0')
  })

  it('starts collapsed when saved, and toggles the hints with H', async () => {
    window.localStorage.setItem('cibi.hintbar.collapsed', '1')
    renderShell('/')
    await screen.findByRole('link', { name: 'Overview' })
    expect(screen.getByRole('button', { name: 'Show keyboard hints' })).toBeTruthy()

    press('h')
    expect(screen.getByRole('note', { name: 'Keyboard hints' })).toBeTruthy()

    press('h')
    expect(screen.getByRole('button', { name: 'Show keyboard hints' })).toBeTruthy()
    window.localStorage.removeItem('cibi.hintbar.collapsed')
  })

  it('shows the bottom bar instead of the rail at compact widths', async () => {
    renderShell('/', true)

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(nav.className).toContain('fixed')
    expect(screen.getAllByRole('link', { name: 'Transactions' })).toHaveLength(1)
  })
})
