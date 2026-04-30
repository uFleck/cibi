import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { GoalsPage } from '@/pages/goals'
import { LAST_CHECK_RESULT_KEY } from '@/components/CheckWidget'
import {
  addGoalLedgerEntry,
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
const mockAddGoalLedgerEntry = vi.mocked(addGoalLedgerEntry)

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

const trackingWithCardEdgeCasesFixture: GoalsTrackingResponse = {
  ...emptyTrackingFixture,
  summary: {
    goals_count: 3,
    completed_count: 1,
    total_target: 2_000,
    total_invested: 1_100,
    total_remaining: 900,
  },
  top_goals: [
    {
      id: 'goal-zero',
      name: 'Starter buffer',
      status: 'active',
      target_amount: 1_000,
      invested_total: 0,
      remaining_amount: 1_000,
      progress_pct: -10,
      target_date_utc: null,
      created_at_utc: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'goal-high',
      name: 'Launch fund',
      status: 'active',
      target_amount: 500,
      invested_total: 600,
      remaining_amount: -100,
      progress_pct: 125,
      target_date_utc: '2026-12-31T00:00:00.000Z',
      created_at_utc: '2026-04-02T00:00:00.000Z',
    },
    {
      id: 'goal-done',
      name: 'Completed bike',
      status: 'completed',
      target_amount: 500,
      invested_total: 500,
      remaining_amount: 0,
      progress_pct: 100,
      target_date_utc: null,
      created_at_utc: '2026-04-03T00:00:00.000Z',
    },
  ],
  recent_activity: [
    {
      goal_id: 'goal-high',
      goal_name: 'Launch fund',
      entry_id: 'entry-high-1',
      amount: 200,
      type: 'contribution',
      source: 'manual',
      timestamp_utc: '2026-04-20T00:00:00.000Z',
    },
    {
      goal_id: 'goal-high',
      goal_name: 'Launch fund',
      entry_id: 'entry-high-2',
      amount: 50,
      type: 'adjustment',
      source: 'system',
      timestamp_utc: '2026-04-21T00:00:00.000Z',
    },
    {
      goal_id: 'goal-high',
      goal_name: 'Launch fund',
      entry_id: 'entry-high-3',
      amount: 25,
      type: 'contribution',
      source: 'recurring',
      timestamp_utc: '2026-04-22T00:00:00.000Z',
    },
    {
      goal_id: 'goal-done',
      goal_name: 'Completed bike',
      entry_id: 'entry-done-1',
      amount: 500,
      type: 'contribution',
      source: 'manual',
      timestamp_utc: '2026-04-23T00:00:00.000Z',
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

describe('GoalsPage progress-card UI contract', () => {
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
    mockFetchAccounts.mockResolvedValue([accountFixture])
    mockFetchGoalsTracking.mockResolvedValue(trackingWithCardEdgeCasesFixture)
    mockAddGoalLedgerEntry.mockResolvedValue({
      id: 'entry-1',
      goal_id: 'goal-zero',
      amount: 50,
      type: 'contribution',
      source: 'manual',
      timestamp_utc: '2026-04-30T12:00:00.000Z',
      note: null,
      reverses_entry_id: null,
    })
  })

  it('renders existing goals as CIBI cards instead of the raw divided list', async () => {
    renderGoalsPageWithClient()

    const cardsSection = await screen.findByLabelText('Goal progress cards')
    expect(within(cardsSection).getByText('Starter buffer')).toBeTruthy()
    expect(within(cardsSection).getByText('Launch fund')).toBeTruthy()
    expect(within(cardsSection).getByText('Completed bike')).toBeTruthy()
    expect(within(cardsSection).getAllByText('Invested').length).toBe(3)
    expect(within(cardsSection).getAllByText('Target').length).toBe(3)
    expect(within(cardsSection).getAllByText('Remaining').length).toBe(3)
    expect(document.querySelector('.divide-y')).toBeNull()
  })

  it('clamps progressbar values visually for below-zero and over-100 progress (Q7 negative)', async () => {
    renderGoalsPageWithClient()

    const zeroProgress = await screen.findByRole('progressbar', { name: 'Starter buffer progress' })
    const highProgress = screen.getByRole('progressbar', { name: 'Launch fund progress' })

    expect(zeroProgress.getAttribute('aria-valuenow')).toBe('0')
    expect(highProgress.getAttribute('aria-valuenow')).toBe('100')
    expect(zeroProgress.querySelector('div')?.getAttribute('style')).toContain('width: 0%')
    expect(highProgress.querySelector('div')?.getAttribute('style')).toContain('width: 100%')
  })

  it('renders explicit no-target copy and does not borrow stale activity rows across goals', async () => {
    renderGoalsPageWithClient()

    const cardsSection = await screen.findByLabelText('Goal progress cards')
    expect(within(cardsSection).getAllByText('No target date').length).toBe(2)
    expect(within(cardsSection).getByText('No recent activity for this goal.')).toBeTruthy()

    const starterCard = within(cardsSection).getByText('Starter buffer').closest('[data-slot="card"]')
    expect(starterCard).toBeTruthy()
    expect(within(starterCard as HTMLElement).queryByText('manual')).not.toBeTruthy()
    expect(within(starterCard as HTMLElement).queryByText('system')).not.toBeTruthy()
  })

  it('limits per-goal activity previews to the two entries prepared by activityByGoal', async () => {
    renderGoalsPageWithClient()

    const cardsSection = await screen.findByLabelText('Goal progress cards')
    const launchCard = within(cardsSection).getByText('Launch fund').closest('[data-slot="card"]')
    expect(launchCard).toBeTruthy()
    expect(within(launchCard as HTMLElement).getByText('Latest 2')).toBeTruthy()
    expect(within(launchCard as HTMLElement).getByText('manual')).toBeTruthy()
    expect(within(launchCard as HTMLElement).getByText('system')).toBeTruthy()
    expect(within(launchCard as HTMLElement).queryByText('recurring')).not.toBeTruthy()
  })
})

describe('GoalsPage quick-contribution UI contract', () => {
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
    mockFetchAccounts.mockResolvedValue([accountFixture])
    mockFetchGoalsTracking.mockResolvedValue(trackingWithGoalFixture)
    mockAddGoalLedgerEntry.mockResolvedValue({
      id: 'entry-1',
      goal_id: 'goal-1',
      amount: 50,
      type: 'contribution',
      source: 'manual',
      timestamp_utc: '2026-04-30T12:00:00.000Z',
      note: null,
      reverses_entry_id: null,
    })
  })

  it('renders a labelled quick-contribution control per goal', async () => {
    renderGoalsPageWithClient()
    expect(await screen.findByLabelText('Quick contribution')).toBeTruthy()
  })

  it('disables Add button for blank, non-numeric, zero, and non-finite values (Q7 negative tests)', async () => {
    renderGoalsPageWithClient()
    const addButton = await screen.findByRole('button', { name: 'Add' })
    const contributionInput = screen.getByLabelText('Quick contribution')

    // blank
    expect(addButton).toHaveProperty('disabled', true)

    // non-numeric 'abc'
    await userEvent.type(contributionInput, 'abc')
    expect(addButton).toHaveProperty('disabled', true)

    // zero
    await userEvent.clear(contributionInput)
    await userEvent.type(contributionInput, '0')
    expect(addButton).toHaveProperty('disabled', true)

    // non-finite string
    await userEvent.clear(contributionInput)
    await userEvent.type(contributionInput, 'Infinity')
    expect(addButton).toHaveProperty('disabled', true)
  })

  it('enables Add button for a valid positive amount', async () => {
    renderGoalsPageWithClient()
    const addButton = await screen.findByRole('button', { name: 'Add' })
    const contributionInput = screen.getByLabelText('Quick contribution')

    await userEvent.type(contributionInput, '50')
    expect(addButton).toHaveProperty('disabled', false)
  })

  it('submits comma-decimal contribution as parsed float and invalidates query (Q7 positive)', async () => {
    const { invalidateSpy } = renderGoalsPageWithClient()
    const addButton = await screen.findByRole('button', { name: 'Add' })
    const contributionInput = screen.getByLabelText('Quick contribution')

    await userEvent.type(contributionInput, '12,50')
    expect(addButton).toHaveProperty('disabled', false)
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(mockAddGoalLedgerEntry).toHaveBeenCalledWith('goal-1', {
        amount: 12.5,
        type: 'contribution',
        source: 'manual',
      })
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['goals', 'tracking', 'acct-1'] })
    })
  })

  it('clears the input only for the submitted goal after success', async () => {
    renderGoalsPageWithClient()
    const contributionInput = await screen.findByLabelText('Quick contribution')

    await userEvent.type(contributionInput, '25')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockAddGoalLedgerEntry).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(contributionInput).toHaveProperty('value', '')
    })
  })

  it('keeps the typed value and surface toast when addMut errors', async () => {
    mockAddGoalLedgerEntry.mockRejectedValue(new Error('Server error'))
    renderGoalsPageWithClient()
    const contributionInput = await screen.findByLabelText('Quick contribution')

    await userEvent.type(contributionInput, '50')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockAddGoalLedgerEntry).toHaveBeenCalledTimes(1)
    })
    // input value is preserved after error (clear-only-submitted contract)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', false)
    })
    expect(contributionInput).toHaveProperty('value', '50')
  })

  it('blocks duplicate submits while addMut is pending (one API call)', async () => {
    let resolveAdd!: () => void
    mockAddGoalLedgerEntry.mockReturnValue(new Promise(resolve => {
      resolveAdd = () => resolve({
        id: 'entry-1',
        goal_id: 'goal-1',
        amount: 50,
        type: 'contribution',
        source: 'manual',
        timestamp_utc: '2026-04-30T12:00:00.000Z',
        note: null,
        reverses_entry_id: null,
      })
    }))

    renderGoalsPageWithClient()
    const contributionInput = await screen.findByLabelText('Quick contribution')

    await userEvent.type(contributionInput, '50')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const pendingButton = await screen.findByRole('button', { name: 'Adding...' })
    expect(pendingButton).toHaveProperty('disabled', true)
    fireEvent.click(pendingButton)
    expect(mockAddGoalLedgerEntry).toHaveBeenCalledTimes(1)

    resolveAdd()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    })
  })
})
