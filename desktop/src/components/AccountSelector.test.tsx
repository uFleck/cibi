import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAccounts } from '@/lib/api'
import { AccountSelector } from './AccountSelector'

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
    fetchAccounts: vi.fn(),
  }
})

const mockFetchAccounts = vi.mocked(fetchAccounts)

function renderSelector() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSelector selectedAccountId={null} onSelectAccount={vi.fn()} compact />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AccountSelector', () => {
  it('offers a Create account link when there are no accounts', async () => {
    mockFetchAccounts.mockResolvedValue([])

    renderSelector()

    const link = await screen.findByRole('link', { name: 'Create account' })
    expect(link.getAttribute('href')).toBe('/accounts')
  })
})
