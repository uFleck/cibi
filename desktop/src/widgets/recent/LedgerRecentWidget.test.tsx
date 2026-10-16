import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLedger, type AccountResponse } from '@/lib/api'
import { requestShellAction } from '@/shell/shellActions'
import { LedgerRecentWidget } from './LedgerRecentWidget'

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    fetchLedger: vi.fn(),
  }
})

vi.mock('@/shell/shellActions', async () => {
  const actual = await vi.importActual<typeof import('@/shell/shellActions')>('@/shell/shellActions')
  return {
    ...actual,
    requestShellAction: vi.fn(),
  }
})

const mockFetchLedger = vi.mocked(fetchLedger)

const account: AccountResponse = {
  id: 'acct-1',
  name: 'Primary',
  current_balance: 0,
  currency: 'BRL',
  is_default: true,
  safety_buffer: 0,
}

function renderWidget() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <LedgerRecentWidget account={account} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  navigateMock.mockReset()
  vi.mocked(requestShellAction).mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LedgerRecentWidget', () => {
  it('offers an Add transaction action when there is no activity', async () => {
    mockFetchLedger.mockResolvedValue([])

    renderWidget()

    expect(await screen.findByText('No activity yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/transactions' })
    expect(requestShellAction).toHaveBeenCalledWith('new-transaction')
  })
})
