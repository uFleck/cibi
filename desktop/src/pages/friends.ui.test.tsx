import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FriendsPage } from '@/pages/friends'
import { createGroupEvent, listFriends, listGroupEvents } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    listFriends: vi.fn(),
    listGroupEvents: vi.fn(),
    createGroupEvent: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockListFriends = vi.mocked(listFriends)
const mockListGroupEvents = vi.mocked(listGroupEvents)
const mockCreateGroupEvent = vi.mocked(createGroupEvent)

function renderFriendsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
          <FriendsPage />
        </AccountContext.Provider>
      </QueryClientProvider>
    </TooltipProvider>
  )
}

describe('FriendsPage create group event', () => {
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
    mockListFriends.mockResolvedValue([])
    mockListGroupEvents.mockResolvedValue([])
    mockCreateGroupEvent.mockResolvedValue({} as Awaited<ReturnType<typeof createGroupEvent>>)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('sends total_amount as a number in dollars in the create request body', async () => {
    renderFriendsPage()

    fireEvent.click(await screen.findByRole('button', { name: /new event/i }))

    fireEvent.change(screen.getByPlaceholderText('Pizza Night'), { target: { value: 'Pizza Night' } })
    fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, {
      target: { value: '2026-07-01' },
    })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '45,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }))

    await waitFor(() => expect(mockCreateGroupEvent).toHaveBeenCalledTimes(1))
    const body = mockCreateGroupEvent.mock.calls[0]![0]
    expect(body).toMatchObject({
      account_id: 'acct-1',
      title: 'Pizza Night',
      date: '2026-07-01',
      total_amount: 45.5,
    })
    expect(typeof body.total_amount).toBe('number')
  })
})
