import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FriendsPage } from '@/pages/friends'
import { toast } from 'sonner'
import { createGroupEvent, deleteFriend, listFriends, listGroupEvents } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    listFriends: vi.fn(),
    listGroupEvents: vi.fn(),
    createGroupEvent: vi.fn(),
    deleteFriend: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockListFriends = vi.mocked(listFriends)
const mockListGroupEvents = vi.mocked(listGroupEvents)
const mockCreateGroupEvent = vi.mocked(createGroupEvent)
const mockDeleteFriend = vi.mocked(deleteFriend)

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
    const dateInput = document.querySelector('input[placeholder="DD/MM/AAAA"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '01/07/2026' } })
    fireEvent.blur(dateInput)
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

  it.each([['0'], ['0,00'], ['0.001']])(
    'rejects a total amount of %s client-side with no request and a message',
    async (amount) => {
      renderFriendsPage()

      fireEvent.click(await screen.findByRole('button', { name: /new event/i }))

      fireEvent.change(screen.getByPlaceholderText('Pizza Night'), { target: { value: 'Pizza Night' } })
      const dateInput = document.querySelector('input[placeholder="DD/MM/AAAA"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '01/07/2026' } })
      fireEvent.blur(dateInput)
      fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: amount } })
      fireEvent.click(screen.getByRole('button', { name: 'Create Event' }))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Total amount must be greater than 0.')
      )
      expect(mockCreateGroupEvent).not.toHaveBeenCalled()
    }
  )
})

describe('FriendsPage delete friend', () => {
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
    mockListFriends.mockResolvedValue([{ id: 'f1', name: 'Alice', public_token: 'tok', notes: null, pix_key: null }])
    mockListGroupEvents.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  async function openDeleteConfirm() {
    renderFriendsPage()
    // The row renders its open action in more than one layout; either one opens the same modal.
    fireEvent.click((await screen.findAllByRole('button', { name: 'Access friend details' }))[0]!)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete friend' }))
    expect(
      await screen.findByText('The friend will be removed. Friends with debts or group events cannot be deleted.')
    ).toBeTruthy()
    expect(screen.queryByText(/debt history/i)).toBeNull()
  }

  it('shows the server message in the toast when the friend still has debts or events', async () => {
    const serverMessage = 'friend still has peer debts or group events; remove them before deleting the friend'
    mockDeleteFriend.mockRejectedValue(new Error(serverMessage))
    await openDeleteConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(serverMessage))
    expect(mockDeleteFriend).toHaveBeenCalledWith('f1')
  })

  it('falls back to the generic message when the error has no message', async () => {
    mockDeleteFriend.mockRejectedValue(new Error(''))
    await openDeleteConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete friend'))
  })

  it('offers an Add friend action in the empty state that opens the friend form', async () => {
    mockListFriends.mockResolvedValue([])
    renderFriendsPage()

    expect(await screen.findByText('No friends yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add friend' }))

    expect(await screen.findByText('New Friend')).toBeTruthy()
  })
})
