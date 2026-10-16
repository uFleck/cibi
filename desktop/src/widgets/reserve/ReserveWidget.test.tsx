import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReserveWidget } from '@/widgets/reserve/ReserveWidget'
import { fetchReserve, markReserveMoved, saveReserveConfig, type ReserveResponse } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    fetchReserve: vi.fn(),
    saveReserveConfig: vi.fn(),
    withdrawReserve: vi.fn(),
    markReserveMoved: vi.fn(),
  }
})

const mockFetch = vi.mocked(fetchReserve)
const mockSave = vi.mocked(saveReserveConfig)
const mockMoved = vi.mocked(markReserveMoved)

function reserve(over: Partial<ReserveResponse> = {}): ReserveResponse {
  return {
    enabled: true,
    target_months: 2,
    start_amount: 50,
    step_amount: 10,
    cap_percent: 5,
    balance: 600,
    target: 3000,
    monthly_obligations: 1500,
    months_covered: 0.4,
    progress: 0.2,
    next_contribution: { amount: 70, payday: '2026-11-05', label: 'salary' },
    eta: '2027-08-05',
    pending_transfers: [],
    entries: [],
    ...over,
  }
}

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ReserveWidget accountId="acc-1" currency="BRL" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  mockFetch.mockReset()
  mockSave.mockReset()
  mockMoved.mockReset()
})

afterEach(() => cleanup())

describe('ReserveWidget', () => {
  it('invites you to set it up while it is off', async () => {
    mockFetch.mockResolvedValue(reserve({ enabled: false, balance: 0, progress: 0 }))
    renderWidget()
    expect(await screen.findByRole('button', { name: 'Set up the reserve' })).toBeTruthy()
  })

  it('shows the balance against the target and the pace', async () => {
    mockFetch.mockResolvedValue(reserve())
    renderWidget()
    expect(await screen.findByText(/Covers 0.4 months of obligations, aiming for 2 months/)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Reserve progress' }).getAttribute('aria-valuenow')).toBe('20')
    expect(screen.getByText(/the target is reached on/)).toBeTruthy()
  })

  it('says so when the target is never reached at the current pace', async () => {
    mockFetch.mockResolvedValue(reserve({ eta: null }))
    renderWidget()
    expect(await screen.findByText(/target is not reached/)).toBeTruthy()
  })

  it('reminds you to move what was set aside, and marks it done', async () => {
    mockFetch.mockResolvedValue(
      reserve({
        pending_transfers: [
          { id: 'e1', amount: 50, kind: 'contribution', note: null, payday: '2026-10-05', posted_at: '2026-10-05T00:00:00Z', moved_at: null },
          { id: 'e2', amount: 60, kind: 'contribution', note: null, payday: '2026-11-05', posted_at: '2026-11-05T00:00:00Z', moved_at: null },
        ],
      }),
    )
    mockMoved.mockResolvedValue(undefined)
    renderWidget()
    expect(await screen.findByText(/to your investment/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(mockMoved).toHaveBeenCalledTimes(2))
    expect(mockMoved).toHaveBeenNthCalledWith(1, 'e1')
    expect(mockMoved).toHaveBeenNthCalledWith(2, 'e2')
  })

  it('saves the settings with the months of obligations you typed', async () => {
    mockFetch.mockResolvedValue(reserve())
    mockSave.mockResolvedValue(reserve({ target_months: 3 }))
    renderWidget()
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    fireEvent.change(screen.getByLabelText('Target, in months of obligations'), { target: { value: '3' } })
    expect(screen.getByText(/the target is R\$\s*4\.500,00/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockSave).toHaveBeenCalled())
    expect(mockSave.mock.calls[0]?.[0]).toMatchObject({
      account_id: 'acc-1',
      enabled: true,
      target_months: 3,
      start_amount: 50,
      step_amount: 10,
      cap_percent: 5,
    })
  })

  it('will not use the reserve without a reason', async () => {
    mockFetch.mockResolvedValue(reserve())
    renderWidget()
    fireEvent.click(await screen.findByRole('button', { name: 'Use reserve' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    const confirm = screen.getAllByRole('button', { name: 'Use reserve' }).at(-1) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Why do you need it?'), { target: { value: 'Car repair' } })
    expect(confirm.disabled).toBe(false)
  })
})
