import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { GoalsSnapshotWidget } from '@/components/GoalsSnapshotWidget'
import {
  fetchAccounts,
  fetchGoalsTracking,
  type AccountResponse,
  type GoalsTrackingResponse,
} from '@/lib/api'

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
    fetchAccounts: vi.fn(),
    fetchGoalsTracking: vi.fn(),
  }
})

const mockFetchAccounts = vi.mocked(fetchAccounts)
const mockFetchGoalsTracking = vi.mocked(fetchGoalsTracking)

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

  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const accountFixture: AccountResponse = {
  id: 'acct-1',
  name: 'Primary',
  current_balance: 1_000,
  currency: 'BRL',
  is_default: true,
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

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
        <GoalsSnapshotWidget />
      </AccountContext.Provider>
    </QueryClientProvider>
  )

  return queryClient
}

beforeEach(() => {
  navigateMock.mockReset()
  mockFetchAccounts.mockResolvedValue([accountFixture])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GoalsSnapshotWidget', () => {
  it('keeps quick action labels stable and navigates to goals', async () => {
    mockFetchGoalsTracking.mockResolvedValue(emptyTrackingFixture)

    renderWidget()

    fireEvent.click(await screen.findByText('Add contribution'))
    fireEvent.click(screen.getByText('Open Goals'))
    fireEvent.click(screen.getByText('View all'))

    expect(navigateMock).toHaveBeenCalledTimes(3)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/goals' })
  })

  it('renders compact goal cards with status, money cells, and clamped progress', async () => {
    mockFetchGoalsTracking.mockResolvedValue(trackingWithGoalsFixture)

    renderWidget()

    expect(await screen.findByLabelText('Emergency fund goal snapshot')).toBeTruthy()
    expect(screen.getByText('active')).toBeTruthy()
    expect(screen.getByText('completed')).toBeTruthy()
    expect(screen.getAllByText('Invested').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Remaining').length).toBeGreaterThan(0)
    expect(screen.getByText('42.5%')).toBeTruthy()
    expect(screen.getByText('100.0%')).toBeTruthy()

    const emergencyProgress = screen.getByRole('progressbar', { name: 'Emergency fund progress' })
    const completedProgress = screen.getByRole('progressbar', { name: 'Bike upgrade progress' })
    expect(emergencyProgress.getAttribute('aria-valuenow')).toBe('42.5')
    expect(completedProgress.getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getAllByText(/R\$/).length).toBeGreaterThanOrEqual(4)
  })

  it('uses explicit shared-card empty state instead of raw text', async () => {
    mockFetchGoalsTracking.mockResolvedValue(emptyTrackingFixture)

    renderWidget()

    expect(await screen.findByText('No goals yet')).toBeTruthy()
    expect(screen.getByText(/Open Goals to create your first target/)).toBeTruthy()
  })

  it('keeps loading state observable', () => {
    mockFetchGoalsTracking.mockReturnValue(new Promise<GoalsTrackingResponse>(() => {}))

    renderWidget()

    expect(screen.getByLabelText('Loading goals snapshot')).toBeTruthy()
    expect(screen.getByText('Loading goals snapshot...')).toBeTruthy()
  })

  it('keeps retry state observable and refetchable', async () => {
    mockFetchGoalsTracking.mockRejectedValue(new Error('network down'))

    renderWidget()

    expect(await screen.findByRole('alert', { name: 'Goals snapshot error' })).toBeTruthy()
    expect(screen.getByText('Could not load goals.')).toBeTruthy()

    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => expect(mockFetchGoalsTracking).toHaveBeenCalledTimes(2))
  })
})
