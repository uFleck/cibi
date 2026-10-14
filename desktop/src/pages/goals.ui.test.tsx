import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GoalsPage } from '@/pages/goals'
import {
  addGoalLedgerEntry,
  createGoal,
  fetchAccounts,
  fetchGoalsTracking,
  updateGoal,
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
    updateGoal: vi.fn(),
    addGoalLedgerEntry: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockFetchAccounts = vi.mocked(fetchAccounts)
const mockFetchGoalsTracking = vi.mocked(fetchGoalsTracking)
const mockCreateGoal = vi.mocked(createGoal)
const mockUpdateGoal = vi.mocked(updateGoal)
const mockAddGoalLedgerEntry = vi.mocked(addGoalLedgerEntry)

const accountFixture: AccountResponse = {
  id: 'acct-1',
  name: 'Primary',
  current_balance: 1_000,
  currency: 'BRL',
  is_default: true,
  safety_buffer: 100,
}

const emptyTrackingFixture: GoalsTrackingResponse = {
  summary: { goals_count: 0, completed_count: 0, total_target: 0, total_invested: 0, total_remaining: 0 },
  top_goals: [],
  recent_activity: [],
  updated_at_utc: '2026-04-30T12:00:00.000Z',
}

const trackingWithTwoGoalsFixture: GoalsTrackingResponse = {
  ...emptyTrackingFixture,
  summary: {
    goals_count: 2,
    completed_count: 0,
    total_target: 2_500,
    total_invested: 600,
    total_remaining: 1_900,
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
    {
      id: 'goal-2',
      name: 'Vacation fund',
      status: 'archived',
      target_amount: 2_000,
      invested_total: 500,
      remaining_amount: 1_500,
      progress_pct: 25,
      target_date_utc: '2026-11-15T00:00:00.000Z',
      created_at_utc: '2026-04-05T00:00:00.000Z',
    },
  ],
  recent_activity: [
    {
      goal_id: 'goal-1',
      goal_name: 'Emergency fund',
      entry_id: 'entry-goal-1',
      amount: 75,
      type: 'contribution',
      source: 'manual',
      timestamp_utc: '2026-04-20T00:00:00.000Z',
    },
  ],
}

function renderGoalsPageWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
          <GoalsPage />
        </AccountContext.Provider>
      </QueryClientProvider>
    </TooltipProvider>
  )

  return { invalidateSpy }
}

function setup(tracking: GoalsTrackingResponse = trackingWithTwoGoalsFixture) {
  mockFetchAccounts.mockResolvedValue([accountFixture])
  mockFetchGoalsTracking.mockResolvedValue(tracking)
  mockCreateGoal.mockResolvedValue({
    id: 'goal-new',
    account_id: 'acct-1',
    name: 'Trip',
    status: 'active',
    target_amount: 123.45,
    invested_total: 0,
    min_contribution_per_window: 0,
    start_date_utc: '2026-04-30T12:00:00.000Z',
    target_date_utc: null,
    notes: null,
    currency: 'BRL',
  })
  mockUpdateGoal.mockResolvedValue()
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
  return renderGoalsPageWithClient()
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
  cleanup()
})

describe('GoalsPage compact + modal flow', () => {
  it('renders compact goals rows with view actions', async () => {
    setup()

    expect(await screen.findByRole('heading', { name: 'Goals Tracking' })).toBeTruthy()
    expect((await screen.findAllByText('Emergency fund')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Vacation fund')).length).toBeGreaterThan(0)

    const viewButtons = await screen.findAllByRole('button', { name: 'View goal details' })
    expect(viewButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('opens goal modal with edit hidden by default', async () => {
    setup()

    await userEvent.click((await screen.findAllByRole('button', { name: 'View goal details' }))[0])

    expect(await screen.findByText('View and edit goal details.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit goal' })).toBeTruthy()
    expect(screen.queryByLabelText('Goal name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save edits' })).toBeNull()
  })

  it('submits goal edits via modal', async () => {
    const { invalidateSpy } = setup()

    await userEvent.click((await screen.findAllByRole('button', { name: 'View goal details' }))[0])
    await userEvent.click(await screen.findByRole('button', { name: 'Edit goal' }))

    const nameInput = await screen.findByLabelText('Goal name')
    const targetInput = screen.getByLabelText('Target amount')
    const minInput = screen.getByLabelText('Min contribution / window')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Emergency++')
    await userEvent.clear(targetInput)
    await userEvent.type(targetInput, '700')
    await userEvent.clear(minInput)
    await userEvent.type(minInput, '40')

    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }))

    await waitFor(() => {
      expect(mockUpdateGoal).toHaveBeenCalledWith('goal-1', {
        name: 'Emergency++',
        target_amount: 700,
        min_contribution_per_window: 40,
      })
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['goals', 'tracking', 'acct-1'] })
    })
  })

  it('removes money from action button with required reason', async () => {
    const { invalidateSpy } = setup()

    await userEvent.click((await screen.findAllByRole('button', { name: 'Remove money' }))[0])

    const removeButton = await screen.findByRole('button', { name: 'Remove money' })
    expect((removeButton as HTMLButtonElement).disabled).toBe(true)

    await userEvent.type(screen.getByLabelText('Amount to remove'), '20')
    await userEvent.type(screen.getByLabelText('Reason'), 'Needed for urgent bill')
    fireEvent.click(screen.getByRole('button', { name: 'Remove money' }))

    await waitFor(() => {
      expect(mockAddGoalLedgerEntry).toHaveBeenCalledWith('goal-1', {
        amount: 20,
        type: 'withdrawal',
        source: 'manual',
        note: 'Needed for urgent bill',
      })
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['goals', 'tracking', 'acct-1'] })
    })
  })
})

describe('GoalsPage create-goal flow still works', () => {
  it('creates goal with comma decimal target', async () => {
    const { invalidateSpy } = setup(emptyTrackingFixture)

    await userEvent.click(screen.getByRole('button', { name: 'New Goal' }))
    await userEvent.type(await screen.findByLabelText('Goal name'), 'Trip')
    await userEvent.type(screen.getByLabelText('Target amount'), '123,45')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(mockCreateGoal).toHaveBeenCalledWith({
        account_id: 'acct-1',
        name: 'Trip',
        target_amount: 123.45,
        min_contribution_per_window: 0,
        start_date_utc: expect.any(String),
      })
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['goals', 'tracking', 'acct-1'] })
    })
  })

})
