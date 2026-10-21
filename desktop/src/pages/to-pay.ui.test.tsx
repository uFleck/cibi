import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { localFetch } from '@/domain/http'
import type { TransactionResponse } from '@/lib/api'
import { ToPayPage } from '@/pages/to-pay'

vi.mock('@/domain/http', () => ({ localFetch: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const mockLocalFetch = vi.mocked(localFetch)

const bill: TransactionResponse = {
  id: 'txn-internet',
  account_id: 'acct-1',
  type: 'personal',
  amount: -120,
  title: 'Internet',
  description: null,
  links: [],
  category: null,
  timestamp: '2026-10-01T00:00:00Z',
  is_recurring: true,
  requires_confirmation: false,
  confirmed_at: null,
  frequency: 'monthly',
  anchor_date: '2026-10-01T00:00:00Z',
  next_occurrence: '2099-11-01T00:00:00Z',
  is_installment: false,
  total_installments: null,
  paid_installments: 0,
}
const diapers: TransactionResponse = {
  ...bill,
  id: 'txn-diapers',
  title: 'Fralda+Lenço',
  amount: -300,
  is_as_needed: true,
  month_budget: -300,
  month_spent: -100,
}
const netflix: TransactionResponse = { ...bill, id: 'txn-netflix', title: 'Netflix', amount: -40, is_uncertain: true }

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/', component: ToPayPage })]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
          <RouterProvider router={router} />
        </AccountContext.Provider>
      </QueryClientProvider>
    </TooltipProvider>,
  )
}

const called = (path: string, method = 'POST') =>
  mockLocalFetch.mock.calls.find(([p, init]) => p === path && init?.method === method)

describe('ToPayPage', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    mockLocalFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/transactions?')) return json([bill, diapers, netflix])
      if (path.startsWith('/api/accounts')) {
        return json([{ id: 'acct-1', name: 'Main', current_balance: 1000, currency: 'BRL', safety_buffer: 0 }])
      }
      if (path.includes('/skip') || path.includes('/confirm')) return json(bill)
      return json([])
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('lists the bills to pay, the as-needed budget left and the uncertain bills apart', async () => {
    renderPage()

    expect(await screen.findByText('Internet')).toBeTruthy()
    expect(screen.getByText(/faltam/).textContent).toMatch(/200,00/)
    expect(screen.getByText(/1 conta .* fora da conta/)).toBeTruthy()
    expect(screen.getByText('Netflix')).toBeTruthy()
  })

  it('skips a bill without paying it', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /pular/i }))
    await waitFor(() => expect(called('/api/transactions/txn-internet/skip')).toBeTruthy())
  })

  it('skips an installment without paying it', async () => {
    const installment: TransactionResponse = {
      ...bill,
      id: 'txn-parcela',
      title: 'Geladeira',
      amount: -200,
      is_recurring: false,
      is_installment: true,
      total_installments: 3,
      paid_installments: 1,
    }
    mockLocalFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/transactions?')) return json([installment])
      if (path.startsWith('/api/accounts')) {
        return json([{ id: 'acct-1', name: 'Main', current_balance: 1000, currency: 'BRL', safety_buffer: 0 }])
      }
      if (path.includes('/skip')) return json(installment)
      return json([])
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /pular/i }))
    await waitFor(() => expect(called('/api/transactions/txn-parcela/skip')).toBeTruthy())
  })

  it('records an as-needed purchase with the amount typed', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /comprei/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/valor pago/i), { target: { value: '45,50' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /marcar como pago/i }))

    await waitFor(() => expect(called('/api/transactions/txn-diapers/confirm')).toBeTruthy())
    expect(JSON.parse(String(called('/api/transactions/txn-diapers/confirm')?.[1]?.body))).toEqual({ amount: -45.5 })
  })
})
