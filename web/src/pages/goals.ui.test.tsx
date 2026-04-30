import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext } from '@/App'
import { GoalsPage } from '@/pages/goals'
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

function renderGoalsPage(tracking: GoalsTrackingResponse = emptyTrackingFixture) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

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

  render(
    <QueryClientProvider client={queryClient}>
      <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
        <GoalsPage />
      </AccountContext.Provider>
    </QueryClientProvider>
  )

  return { invalidateSpy, queryClient }
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
