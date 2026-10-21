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
    upcoming_contributions: [],
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
    expect(await screen.findByRole('button', { name: 'Configurar a reserva' })).toBeTruthy()
  })

  it('shows the balance against the target and the pace', async () => {
    mockFetch.mockResolvedValue(reserve())
    renderWidget()
    expect(await screen.findByText(/Cobre 0.4 meses das contas, com meta de 2 meses/)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Progresso da reserva' }).getAttribute('aria-valuenow')).toBe('20')
    expect(screen.getByText(/a meta será atingida em/)).toBeTruthy()
  })

  it('says so when the target is never reached at the current pace', async () => {
    mockFetch.mockResolvedValue(reserve({ eta: null }))
    renderWidget()
    expect(await screen.findByText(/a meta não será atingida/)).toBeTruthy()
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
    expect(await screen.findByText(/para seu investimento/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Feito' }))
    await waitFor(() => expect(mockMoved).toHaveBeenCalledTimes(2))
    expect(mockMoved).toHaveBeenNthCalledWith(1, 'e1')
    expect(mockMoved).toHaveBeenNthCalledWith(2, 'e2')
  })

  it('saves the settings with the months of obligations you typed', async () => {
    mockFetch.mockResolvedValue(reserve())
    mockSave.mockResolvedValue(reserve({ target_months: 3 }))
    renderWidget()
    fireEvent.click(await screen.findByRole('button', { name: 'Configurações' }))
    fireEvent.change(screen.getByLabelText('Meta, em meses de contas'), { target: { value: '3' } })
    expect(screen.getByText(/a meta é R\$\s*4\.500,00/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Usar reserva' }))
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '100' } })
    const confirm = screen.getAllByRole('button', { name: 'Usar reserva' }).at(-1) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Para que você precisa?'), { target: { value: 'Conserto do carro' } })
    expect(confirm.disabled).toBe(false)
  })
})
