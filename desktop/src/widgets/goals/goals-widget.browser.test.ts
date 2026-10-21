import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { CheckWidget } from '@/widgets/check/CheckWidget'
import { GoalsSnapshotWidget } from '@/widgets/goals/GoalsSnapshotWidget'
import {
  fetchAccounts,
  fetchGoalsTracking,
  postCheck,
  type AccountResponse,
  type CheckResponse,
  type GoalsTrackingResponse,
} from '@/lib/api'

const navigateMock = vi.hoisted(() => vi.fn())
const toastErrorMock = vi.hoisted(() => vi.fn())

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
    fetchAccounts: vi.fn(),
    fetchGoalsTracking: vi.fn(),
    postCheck: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
  },
}))

const mockFetchAccounts = vi.mocked(fetchAccounts)
const mockFetchGoalsTracking = vi.mocked(fetchGoalsTracking)
const mockPostCheck = vi.mocked(postCheck)

const accountFixture: AccountResponse = {
  id: 'acct-1',
  name: 'Primary',
  current_balance: 1_000,
  currency: 'BRL',
  safety_buffer: 100,
}

const emptyTrackingFixture: GoalsTrackingResponse = {
  summary: {
    goals_count: 0,
    completed_count: 0,
    total_target: 0,
    total_invested: 0,
    total_remaining: 0,
  },
  top_goals: [],
  recent_activity: [],
  updated_at_utc: '2026-04-30T12:00:00.000Z',
}

const trackingWithGoalsFixture: GoalsTrackingResponse = {
  ...emptyTrackingFixture,
  summary: {
    goals_count: 2,
    completed_count: 0,
    total_target: 2_500,
    total_invested: 850,
    total_remaining: 1_650,
  },
  top_goals: [
    {
      id: 'goal-1',
      name: 'Emergency fund',
      status: 'active',
      target_amount: 1_000,
      invested_total: 425,
      remaining_amount: 575,
      progress_pct: 42.5,
      target_date_utc: null,
      created_at_utc: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'goal-2',
      name: 'Bike upgrade',
      status: 'completed',
      target_amount: 1_500,
      invested_total: 1_500,
      remaining_amount: 0,
      progress_pct: 125,
      target_date_utc: null,
      created_at_utc: '2026-04-02T00:00:00.000Z',
    },
  ],
}

const checkResultFixture: CheckResponse = {
  can_buy: false,
  purchasing_power: 120,
  buffer_remaining: 75,
  risk_level: 'WAIT',
  will_afford_after_payday: true,
  wait_until: '2026-05-15T00:00:00.000Z',
  goals_covered_this_window: [],
  goal_impacts: [
    {
      goal_id: 'goal-1',
      goal_name: 'Emergency fund',
      remaining_before: 575,
      remaining_after: 625,
      progress_before_pct: 42.5,
      progress_after_pct: 37.5,
      min_contribution_per_window: 200,
      severity: 'high',
    },
  ],
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height })
  window.dispatchEvent(new Event('resize'))
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(AccountContext.Provider, { value: { selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() } }, node)
    )
  )

  return queryClient
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  class ResizeObserverMock {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock })
  Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverMock })
})

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  setViewport(1024, 768)
  window.scrollTo = vi.fn()
  navigateMock.mockReset()
  toastErrorMock.mockReset()
  mockFetchAccounts.mockResolvedValue([accountFixture])
  mockFetchGoalsTracking.mockResolvedValue(trackingWithGoalsFixture)
  mockPostCheck.mockResolvedValue(checkResultFixture)
})

afterEach(() => {
  cleanup()
})

describe('dashboard goals browser contract', () => {
  it('keeps snapshot cards responsive, keyboard navigable, and explicit about ARIA progress', async () => {
    renderWithProviders(React.createElement(GoalsSnapshotWidget))

    const snapshot = await screen.findByLabelText('Resumo das metas')
    expect(within(snapshot).getByText('Metas mais urgentes')).toBeTruthy()

    const cards = await screen.findByLabelText('Cartões de resumo das metas')
    expect(snapshot.contains(cards)).toBe(true)
    expect(cards.className).toContain('flex')
    expect(cards.className).toContain('flex-col')
    expect(within(cards).getByLabelText('Resumo da meta Emergency fund')).toBeTruthy()

    const emergencyProgress = within(cards).getByRole('progressbar', { name: 'Progresso de Emergency fund' })
    const completedProgress = within(cards).getByRole('progressbar', { name: 'Progresso de Bike upgrade' })
    expect(emergencyProgress.getAttribute('aria-valuenow')).toBe('42.5')
    expect(completedProgress.getAttribute('aria-valuenow')).toBe('100')

    const user = userEvent.setup()
    await user.tab()
    expect(document.activeElement).toBe(within(snapshot).getByRole('button', { name: 'Ver todas' }))
    await user.keyboard('{Enter}')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/goals' })

    expect(within(snapshot).queryByRole('button', { name: 'Add contribution' })).toBeNull()
    expect(within(snapshot).queryByRole('button', { name: 'Open Goals' })).toBeNull()
  })

  it('surfaces snapshot loading, empty, and retryable error states for future debugging', async () => {
    mockFetchGoalsTracking.mockReturnValueOnce(new Promise<GoalsTrackingResponse>(() => {}))
    renderWithProviders(React.createElement(GoalsSnapshotWidget))

    expect(screen.getByRole('status', { name: 'Carregando resumo das metas' })).toBeTruthy()
    expect(screen.getByText('Carregando resumo das metas...')).toBeTruthy()

    cleanup()
    vi.clearAllMocks()
    mockFetchAccounts.mockResolvedValue([accountFixture])
    mockFetchGoalsTracking.mockResolvedValueOnce(emptyTrackingFixture)
    renderWithProviders(React.createElement(GoalsSnapshotWidget))

    expect(await screen.findByText('Nenhuma meta ainda')).toBeTruthy()
    expect(screen.getByText(/Abra Metas para criar seu primeiro objetivo/)).toBeTruthy()

    cleanup()
    vi.clearAllMocks()
    mockFetchAccounts.mockResolvedValue([accountFixture])
    mockFetchGoalsTracking
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(emptyTrackingFixture)
    renderWithProviders(React.createElement(GoalsSnapshotWidget))

    const alert = await screen.findByRole('alert', { name: 'Erro no resumo das metas' })
    expect(alert.textContent).toContain('Não deu para carregar as metas.')
    expect(alert.textContent).toContain('Tente de novo sem alterar os dados do painel.')

    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(mockFetchGoalsTracking).toHaveBeenCalledTimes(2))
  })
})

describe('check-impact browser contract', () => {
  it('keeps the check-impact flow labelled, mobile stacked, keyboard submittable, and progress-aware', async () => {
    setViewport(390, 844)
    renderWithProviders(React.createElement(CheckWidget, { accountId: 'acct-1' }))

    const input = screen.getByLabelText('Valor da compra') as HTMLInputElement
    const checkButton = screen.getByRole('button', { name: 'Verificar impacto da compra' }) as HTMLButtonElement
    const inputRow = input.closest('.relative')?.parentElement
    expect(input.className).toContain('focus-visible:ring-primary/50')
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(inputRow?.className).toContain('flex-col')
    expect(inputRow?.className).toContain('@md:flex-row')
    expect(checkButton.className).toContain('w-full')
    expect(checkButton.className).toContain('@md:w-auto')

    const user = userEvent.setup()
    await user.type(input, '50')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockPostCheck).toHaveBeenCalledWith(50, 'acct-1'))
    expect(await screen.findByText('AGUARDE')).toBeTruthy()
    expect(screen.getByLabelText('Prévia do impacto nas metas')).toBeTruthy()
    expect(screen.getByLabelText('Impacto da compra em Emergency fund')).toBeTruthy()

    expect(screen.getByText('Impacto na capacidade de aporte')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('Esta verificação não altera o progresso da meta.'))).toBeTruthy()
  })

  it('makes check loading and error recovery visible without screenshots', async () => {
    let rejectCheck!: (reason: Error) => void
    mockPostCheck.mockReturnValueOnce(new Promise<CheckResponse>((_, reject) => { rejectCheck = reject }))

    renderWithProviders(React.createElement(CheckWidget))

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Valor da compra'), '25')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    const status = screen.getByRole('status')
    expect(status.textContent).toContain('Verificando esta compra com seu fluxo de caixa')
    expect(screen.getByRole('button', { name: 'Verificando impacto da compra' })).toHaveProperty('disabled', true)

    rejectCheck(new Error('network down'))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Algo deu errado. Tente de novo.'))
    const alert = screen.getByRole('alert', { name: 'Erro na verificação da compra' })
    expect(alert.textContent).toContain('Não deu para verificar o impacto da compra.')
    expect(alert.textContent).toContain('Algo deu errado. Tente de novo quando a conexão estiver disponível.')
    expect(screen.getByLabelText('Valor da compra').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('button', { name: 'Verificar impacto da compra' })).toBeTruthy()
  })
})
