import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TransactionsPage } from '@/pages/transactions'
import { localFetch } from '@/domain/http'
import type { TransactionResponse } from '@/lib/api'
import { toast } from 'sonner'
import { Inspector } from '@/shell/Inspector'
import { SelectionProvider } from '@/shell/SelectionProvider'

vi.mock('@/domain/http', () => ({ localFetch: vi.fn() }))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const mockLocalFetch = vi.mocked(localFetch)

const LEDGER_MESSAGE = 'transaction has ledger entries and cannot be deleted'

const confirmedTxn: TransactionResponse = {
  id: 'txn-1',
  account_id: 'acct-1',
  type: 'personal',
  amount: -120,
  description: 'Internet bill',
  timestamp: '2026-10-01T00:00:00Z',
  is_recurring: true,
  requires_confirmation: true,
  confirmed_at: '2026-10-02T00:00:00Z',
  frequency: 'monthly',
  anchor_date: '2026-10-01T00:00:00Z',
  next_occurrence: '2026-11-01T00:00:00Z',
  is_installment: false,
  total_installments: null,
  paid_installments: 0,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// After the first transactions fetch, refetches never resolve. The delete mutation's
// onSettled invalidation therefore cannot repopulate the row: only the rollback can.
function routeRequests() {
  let transactionFetches = 0
  mockLocalFetch.mockImplementation(async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method === 'DELETE' && path === `/api/transactions/${confirmedTxn.id}`) {
      return json({ error: LEDGER_MESSAGE }, 409)
    }
    if (path.startsWith('/api/transactions?')) {
      transactionFetches += 1
      if (transactionFetches > 1) return new Promise<Response>(() => {})
      return json([confirmedTxn])
    }
    if (path.startsWith('/api/accounts')) {
      return json([
        { id: 'acct-1', name: 'Main', current_balance: 1000, currency: 'BRL', is_default: true, safety_buffer: 0 },
      ])
    }
    return json([])
  })
}

function renderTransactionsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
          <TransactionsPage />
        </AccountContext.Provider>
      </QueryClientProvider>
    </TooltipProvider>
  )
}

describe('TransactionsPage delete', () => {
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
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    routeRequests()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('keeps the row and shows the server message when deleting a confirmed transaction returns 409', async () => {
    renderTransactionsPage()

    expect(await screen.findByText('Internet bill')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith(LEDGER_MESSAGE))
    expect(
      mockLocalFetch.mock.calls.some(([path, init]) => path === '/api/transactions/txn-1' && init?.method === 'DELETE'),
    ).toBe(true)
    expect(screen.getByText('Internet bill')).toBeTruthy()
  })
})

function renderWithInspector() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
          <SelectionProvider resetKey="/transactions">
            <TransactionsPage />
            <aside aria-label="Inspector">
              <Inspector />
            </aside>
          </SelectionProvider>
        </AccountContext.Provider>
      </QueryClientProvider>
    </TooltipProvider>
  )
}

describe('TransactionsPage selection and filters', () => {
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
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    routeRequests()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows the selected transaction in the inspector with Mark paid', async () => {
    renderWithInspector()

    fireEvent.click(await screen.findByText('Internet bill'))
    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    expect(await within(inspector).findByRole('heading', { name: 'Internet bill' })).toBeTruthy()

    fireEvent.click(within(inspector).getByRole('button', { name: /mark paid/i }))

    await waitFor(() =>
      expect(mockLocalFetch.mock.calls.some(([path, init]) => path === '/api/transactions/txn-1/confirm' && init?.method === 'POST')).toBe(true),
    )
  })

  it('opens the transaction form from the inspector Edit action', async () => {
    renderWithInspector()

    fireEvent.click(await screen.findByText('Internet bill'))
    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    fireEvent.click(await within(inspector).findByRole('button', { name: /edit/i }))

    expect(await screen.findByRole('dialog', { name: 'Edit Transaction' })).toBeTruthy()
  })

  it('selects the transaction named in the select search param', async () => {
    window.history.replaceState({}, '', '/transactions?select=txn-1')
    renderWithInspector()

    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    expect(await within(inspector).findByRole('heading', { name: 'Internet bill' })).toBeTruthy()
    window.history.replaceState({}, '', '/')
  })

  it('keeps a ?select= selection until the transaction loads', async () => {
    const gate: { release?: (response: Response) => void } = {}
    mockLocalFetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if ((options?.method ?? 'GET') === 'GET' && path.startsWith('/api/transactions?')) {
        return new Promise<Response>(resolve => { gate.release = resolve })
      }
      if (path.startsWith('/api/accounts')) {
        return json([{ id: 'acct-1', name: 'Main', current_balance: 1000, currency: 'BRL', is_default: true, safety_buffer: 0 }])
      }
      return json([])
    })
    window.history.replaceState({}, '', '/transactions?select=txn-1')
    renderWithInspector()

    await waitFor(() => expect(gate.release).toBeDefined())
    gate.release?.(json([confirmedTxn]))

    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    expect(await within(inspector).findByRole('heading', { name: 'Internet bill' })).toBeTruthy()
    window.history.replaceState({}, '', '/')
  })

  it('clears the selection when a filter hides the selected row', async () => {
    renderWithInspector()

    fireEvent.click(await screen.findByText('Internet bill'))
    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    expect(await within(inspector).findByRole('heading', { name: 'Internet bill' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /income/i }))
    await waitFor(() => expect(within(inspector).queryByRole('heading', { name: 'Internet bill' })).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /^all/i }))
    expect(await screen.findByText('Internet bill')).toBeTruthy()
    expect(within(inspector).queryByRole('heading', { name: 'Internet bill' })).toBeNull()
  })

  it('filters the list with the Income chip', async () => {
    renderWithInspector()
    expect(await screen.findByText('Internet bill')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /income/i }))

    expect(await screen.findByText('No transactions match your filters')).toBeTruthy()
    expect(screen.queryByText('Internet bill')).toBeNull()
  })
})
