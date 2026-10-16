import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateAccount, type AccountResponse } from '@/lib/api'
import { StatCards } from './StatCards'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, updateAccount: vi.fn().mockResolvedValue({}) }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

const account: AccountResponse = { id: 'a1', name: 'Main', current_balance: 1000, currency: 'BRL', safety_buffer: 0 }

function renderCards() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <StatCards account={account} recurringTxns={[]} nextPayday={null} />
    </QueryClientProvider>,
  )
}

describe('StatCards balance adjustment', () => {
  afterEach(cleanup)

  it('adjusts the balance from the Balance card popover', async () => {
    renderCards()
    fireEvent.click(screen.getByText('Balance'))
    const input = await screen.findByLabelText(/Set the balance to match your bank/)
    fireEvent.change(input, { target: { value: '1250.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith('a1', { current_balance: 1250.5 }))
  })

  it('keeps Adjust disabled until the value changes', async () => {
    renderCards()
    fireEvent.click(screen.getByText('Balance'))
    const button = await screen.findByRole('button', { name: 'Adjust' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })
})
