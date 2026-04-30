import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { GoalsPage } from '@/pages/goals'
import { LAST_CHECK_RESULT_KEY } from '@/components/CheckWidget'
import {
  createGoal,
  fetchAccounts,
  fetchGoalsTracking,
  type AccountResponse,
  type GoalsTrackingResponse,
} from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    fetchAccounts: vi.fn(),
    fetchGoalsTracking: vi.fn(),
    createGoal: vi.fn(),
    addGoalLedgerEntry: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockFetchAccounts = vi.mocked(fetchAccounts)
const mockFetchGoalsTracking = vi.mocked(fetchGoalsTracking)
const mockCreateGoal = vi.mocked(createGoal)

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

const trackingWithGoalFixture: GoalsTrackingResponse = {
  ...emptyTrackingFixture,
  summary: {
    goals_count: 1,
    completed_count: 0,
    total_target: 500,
    total_invested: 100,
    total_remaining: 400,
  },
  top_goals: [
    {
      id: 'goal-1',
      name: 'Emergency fund',
      status: 'active',
      target_amount: 500,
      invested_total: 100,
      remaining_amount: 400,
      progress_pct: 20,
      target_date_utc: null,
      created_at_utc: '2026-04-01T00:00:00.000Z',
    },
  ],
}

function renderGoalsPageWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <QueryClientProvider client={queryClient}>
      <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
        <GoalsPage />
      </AccountContext.Provider>
    </QueryClientProvider>
  )

  return { invalidateSpy, queryClient }
}

function renderGoalsPage(tracking: GoalsTrackingResponse = emptyTrackingFixture) {
  mockFetchAccounts.mockResolvedValue([accountFixture])
  mockFetchGoalsTracking.mockResolvedValue(tracking)
  mockCreateGoal.mockResolvedValue({
    id: 'goal-2',
    account_id: 'acct-1',
    name: 'Trip',
    status: 'active',
    target_amount: 123.45,
    invested_total: 0,
    start_date_utc: '2026-04-30T12:00:00.000Z',
    target_date_utc: null,
    notes: null,
    currency: 'BRL',
  })

  return renderGoalsPageWithClient()
}

describe('GoalsPage create-goal UI contract', () => {
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

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('renders the CIBI shell, summary cards, and create surface with stable accessible copy', async () => {
    renderGoalsPage(trackingWithGoalFixture)

    expect(await screen.findByRole('heading', { name: 'Goals Tracking' })).toBeTruthy()
    expect(screen.getByText(/Plan targets, monitor progress/)).toBeTruthy()

    const summary = await screen.findByLabelText('Goals summary')
    expect(screen.getByText(/^Updated /)).toBeTruthy()
    expect(within(summary).getByText('Goals')).toBeTruthy()
    expect(within(summary).getByText('Completed')).toBeTruthy()
    expect(within(summary).getByText('Invested')).toBeTruthy()
    expect(within(summary).getByText('Remaining')).toBeTruthy()
    expect(within(summary).getByText(/R\$\s*100[,.]00/)).toBeTruthy()
    expect(within(summary).getByText(/R\$\s*400[,.]00/)).toBeTruthy()

    expect(screen.getByLabelText('Goal name')).toBeTruthy()
    expect(screen.getByLabelText('Target amount')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
  })

  it('exposes accessible loading states while the tracking query is pending', async () => {
    mockFetchAccounts.mockResolvedValue([accountFixture])
    mockFetchGoalsTracking.mockReturnValue(new Promise(() => {}))
    mockCreateGoal.mockResolvedValue({
      id: 'goal-2',
      account_id: 'acct-1',
      name: 'Trip',
      status: 'active',
      target_amount: 123.45,
      invested_total: 0,
      start_date_utc: '2026-04-30T12:00:00.000Z',
      target_date_utc: null,
      notes: null,
      currency: 'BRL',
    })

    renderGoalsPageWithClient()

    expect(await screen.findByRole('status', { name: 'Loading goals tracking summary' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading goals list' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading goals activity' })).toBeTruthy()
  })

  it('localizes tracking query failures and keeps retry explicit', async () => {
    mockFetchAccounts.mockResolvedValue([accountFixture])
    mockFetchGoalsTracking
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(emptyTrackingFixture)
    mockCreateGoal.mockResolvedValue({
      id: 'goal-2',
      account_id: 'acct-1',
      name: 'Trip',
      status: 'active',
      target_amount: 123.45,
      invested_total: 0,
      start_date_utc: '2026-04-30T12:00:00.000Z',
      target_date_utc: null,
      notes: null,
      currency: 'BRL',
    })

    renderGoalsPageWithClient()

    const errorCard = await screen.findByRole('alert', { name: 'Goals tracking error' })
    expect(errorCard.textContent).toContain('Could not load goals tracking.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(mockFetchGoalsTracking).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.queryByRole('alert', { name: 'Goals tracking error' })).not.toBeTruthy()
    })
  })

  it('renders a coherent empty state while keeping create-goal controls available', async () => {
    renderGoalsPage(emptyTrackingFixture)

    expect(await screen.findByText('No goals yet')).toBeTruthy()
    expect(screen.getByText(/Create your first goal and CIBI will track/)).toBeTruthy()
    expect(screen.getByLabelText('Goal name')).toBeTruthy()
    expect(screen.getByLabelText('Target amount')).toBeTruthy()
  })

  it('preserves guarded latest-check storage parsing and renders valid impact data', async () => {
    sessionStorage.setItem(LAST_CHECK_RESULT_KEY, '{not-json')
    renderGoalsPage(trackingWithGoalFixture)

    await screen.findByRole('heading', { name: 'Goals Tracking' })
    expect(screen.queryByLabelText('Latest purchase impact')).not.toBeTruthy()

    cleanup()
    vi.clearAllMocks()
    sessionStorage.clear()
    sessionStorage.setItem(LAST_CHECK_RESULT_KEY, JSON.stringify({
      can_buy: false,
      purchasing_power: 20,
      buffer_remaining: 5,
      risk_level: 'HIGH',
      will_afford_after_payday: false,
      wait_until: null,
      goal_impacts: [
        {
          goal_id: 'goal-1',
          goal_name: 'Emergency fund',
          remaining_before: 400,
          remaining_after: 450,
          progress_before_pct: 20,
          progress_after_pct: 10,
          severity: 'high',
        },
      ],
    }))

    renderGoalsPage(trackingWithGoalFixture)

    const latestImpact = await screen.findByLabelText('Latest purchase impact')
    expect(within(latestImpact).getByText('Emergency fund')).toBeTruthy()
    expect(within(latestImpact).getByText('high')).toBeTruthy()
    expect(within(latestImpact).getByText(/R\$\s*400[,.]00/)).toBeTruthy()
    expect(within(latestImpact).getByText(/R\$\s*450[,.]00/)).toBeTruthy()
  })

  it('exposes labelled create controls and blocks invalid targets', async () => {
    renderGoalsPage(trackingWithGoalFixture)

    const nameInput = await screen.findByLabelText('Goal name')
    const targetInput = screen.getByLabelText('Target amount')
    const createButton = screen.getByRole('button', { name: 'Create' })

    expect(createButton).toHaveProperty('disabled', true)

    await userEvent.type(nameInput, 'Trip')
    expect(createButton).toHaveProperty('disabled', true)

    const invalidTargets = ['0', '-1', 'Infinity']
    for (const value of invalidTargets) {
      await userEvent.clear(targetInput)
      await userEvent.type(targetInput, value)
      expect(createButton).toHaveProperty('disabled', true)
    }

    await userEvent.clear(targetInput)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '   ')
    await userEvent.type(targetInput, '123')
    expect(createButton).toHaveProperty('disabled', true)

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Trip')
    expect(createButton).toHaveProperty('disabled', false)
  })

  it('submits comma decimals through the existing create and invalidation path', async () => {
    const { invalidateSpy } = renderGoalsPage()

    await userEvent.type(await screen.findByLabelText('Goal name'), 'Trip')
    await userEvent.type(screen.getByLabelText('Target amount'), '123,45')

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockCreateGoal).toHaveBeenCalledWith({
        account_id: 'acct-1',
        name: 'Trip',
        target_amount: 123.45,
        start_date_utc: expect.any(String),
      })
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['goals', 'tracking', 'acct-1'] })
    })
    await waitFor(() => {
      expect(mockFetchGoalsTracking).toHaveBeenCalledTimes(2)
    })
  })

  it('shows pending copy and blocks repeated submits while create is in flight', async () => {
    let resolveCreate!: () => void
    renderGoalsPage()
    mockCreateGoal.mockReturnValue(new Promise(resolve => {
      resolveCreate = () => resolve({
        id: 'goal-2',
        account_id: 'acct-1',
        name: 'Trip',
        status: 'active',
        target_amount: 123.45,
        invested_total: 0,
        start_date_utc: '2026-04-30T12:00:00.000Z',
        target_date_utc: null,
        notes: null,
        currency: 'BRL',
      })
    }))

    await userEvent.type(await screen.findByLabelText('Goal name'), 'Trip')
    await userEvent.type(screen.getByLabelText('Target amount'), '123')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    const pendingButton = await screen.findByRole('button', { name: 'Creating...' })
    expect(pendingButton).toHaveProperty('disabled', true)
    fireEvent.click(pendingButton)
    expect(mockCreateGoal).toHaveBeenCalledTimes(1)

    resolveCreate()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true)
    })
  })

  it('keeps entered values and re-enables create after mutation rejection', async () => {
    renderGoalsPage()
    mockCreateGoal.mockRejectedValue(new Error('Create failed'))

    const nameInput = await screen.findByLabelText('Goal name')
    const targetInput = screen.getByLabelText('Target amount')
    await userEvent.type(nameInput, 'Trip')
    await userEvent.type(targetInput, '123,45')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockCreateGoal).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', false)
    })
    expect(nameInput).toHaveProperty('value', 'Trip')
    expect(targetInput).toHaveProperty('value', '123,45')
  })
})
