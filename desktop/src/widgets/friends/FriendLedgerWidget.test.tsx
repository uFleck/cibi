import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fetchFriendBreakdown, fetchFriendSummary, listFriends } from '@/lib/api'
import { FriendLedgerWidget } from './FriendLedgerWidget'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
  }
})

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    listFriends: vi.fn(),
    fetchFriendSummary: vi.fn(),
    fetchFriendBreakdown: vi.fn(),
  }
})

const mockListFriends = vi.mocked(listFriends)
const mockFetchFriendSummary = vi.mocked(fetchFriendSummary)
const mockFetchFriendBreakdown = vi.mocked(fetchFriendBreakdown)

const zeroSummary = {
  total_owed_to_user: 0,
  total_user_owes: 0,
  net: 0,
} as Awaited<ReturnType<typeof fetchFriendSummary>>

function renderWidget() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
          <FriendLedgerWidget />
        </AccountContext.Provider>
      </QueryClientProvider>
    </TooltipProvider>
  )
}

beforeEach(() => {
  mockFetchFriendSummary.mockResolvedValue(zeroSummary)
  mockFetchFriendBreakdown.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FriendLedgerWidget', () => {
  it('offers an Add friend action when there are no friends yet', async () => {
    mockListFriends.mockResolvedValue([])

    renderWidget()

    expect(await screen.findByText('No friends yet.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add friend' }).getAttribute('href')).toBe('/friends')
  })

  it('keeps the balance message when friends exist without outstanding balances', async () => {
    mockListFriends.mockResolvedValue([
      { id: 'f1', name: 'Ana', pix_key: '', notes: '' } as Awaited<ReturnType<typeof listFriends>>[number],
    ])

    renderWidget()

    expect(await screen.findByText('No outstanding balances')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Add friend' })).toBeNull()
  })
})
