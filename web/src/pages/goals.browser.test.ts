import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { AccountContext } from '@/App'
import { GoalsPage } from '@/pages/goals'
import {
  fetchAccounts,
  fetchGoalsTracking,
  createGoal,
  addGoalLedgerEntry,
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
    fetchDefaultAccount: vi.fn(),
    fetchTransactions: vi.fn(),
    listPaySchedules: vi.fn(),
    fetchFriendBreakdown: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
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

const trackingWithGoalFixture: GoalsTrackingResponse = {
  ...emptyTrackingFixture,
  summary: {
    goals_count: 1,
    completed_count: 0,
    total_target: 1_000,
    total_invested: 425,
    total_remaining: 575,
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
  ],
  recent_activity: [
    {
      goal_id: 'goal-1',
      goal_name: 'Emergency fund',
      entry_id: 'entry-1',
      amount: 75,
      type: 'contribution',
      source: 'manual',
      timestamp_utc: '2026-04-20T00:00:00.000Z',
    },
  ],
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height })
  window.dispatchEvent(new Event('resize'))
}

function renderGoalsPageWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(AccountContext.Provider, { value: { selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() } },
        React.createElement(GoalsPage)
      )
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
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState({}, '', '/')
  window.scrollTo = vi.fn()
  setViewport(1024, 768)
  mockFetchAccounts.mockResolvedValue([accountFixture])
  mockFetchGoalsTracking.mockResolvedValue(trackingWithGoalFixture)
  mockCreateGoal.mockResolvedValue({
    id: 'goal-created',
    account_id: 'acct-1',
    name: 'Trip',
    status: 'active',
    target_amount: 123,
    invested_total: 0,
    start_date_utc: '2026-04-30T12:00:00.000Z',
    target_date_utc: null,
    notes: null,
    currency: 'BRL',
  })
  mockAddGoalLedgerEntry.mockResolvedValue({
    id: 'entry-created',
    goal_id: 'goal-1',
    amount: 25,
    type: 'contribution',
    source: 'manual',
    note: null,
    reverses_entry_id: null,
    timestamp_utc: '2026-04-30T12:00:00.000Z',
  })
})

afterEach(() => {
  cleanup()
})

describe('GoalsPage browser contract', () => {
  it('boots the app on /goals with labelled controls, desktop layout hooks, keyboard focus, and progressbar semantics', async () => {
    window.history.pushState({}, '', '/goals')

    render(React.createElement(App))

    expect(await screen.findByRole('heading', { name: 'Goals Tracking' })).toBeTruthy()
    expect(window.location.pathname).toBe('/goals')

    const goalName = screen.getByLabelText('Goal name') as HTMLInputElement
    const targetAmount = screen.getByLabelText('Target amount') as HTMLInputElement
    const createButton = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(goalName.className).toContain('focus-visible:ring')
    expect(targetAmount.getAttribute('inputmode')).toBe('decimal')
    expect(createButton.disabled).toBe(true)

    const form = goalName.closest('form')
    expect(form?.className).toContain('grid-cols-1')
    expect(form?.className).toContain('sm:grid-cols-[minmax(0,1fr)_220px_120px]')

    const progress = await screen.findByRole('progressbar', { name: 'Emergency fund progress' })
    expect(progress.getAttribute('aria-valuemin')).toBe('0')
    expect(progress.getAttribute('aria-valuemax')).toBe('100')
    expect(progress.getAttribute('aria-valuenow')).toBe('42.5')

    const user = userEvent.setup()
    goalName.focus()
    expect(document.activeElement).toBe(goalName)
    await user.tab()
    expect(document.activeElement).toBe(targetAmount)
    await user.type(goalName, 'Trip')
    await user.type(targetAmount, '123')
    expect(createButton.disabled).toBe(false)
  })

  it('keeps the mobile card flow observable with stacked classes and keyboard-friendly contribution controls', async () => {
    setViewport(390, 844)

    renderGoalsPageWithClient()

    const page = await screen.findByRole('heading', { name: 'Goals Tracking' })
    const pageShell = page.closest('.max-w-2xl')
    expect(pageShell?.className).toContain('px-4')
    expect(pageShell?.className).toContain('sm:px-6')

    const goalCard = (await screen.findByText('Emergency fund')).closest('[data-slot="card"]') as HTMLElement
    expect(goalCard).toBeTruthy()
    expect(within(goalCard).getByLabelText('Quick contribution')).toBeTruthy()

    const responsiveStats = within(goalCard).getByText('Invested').closest('.grid')
    expect(responsiveStats?.className).toContain('grid-cols-1')
    expect(responsiveStats?.className).toContain('min-[520px]:grid-cols-3')

    const contributionForm = within(goalCard).getByLabelText('Quick contribution').closest('form')
    expect(contributionForm?.className).toContain('flex')
    expect(within(goalCard).getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true)

    const user = userEvent.setup()
    await user.click(within(goalCard).getByLabelText('Quick contribution'))
    await user.keyboard('25{Tab}')
    expect(document.activeElement).toBe(within(goalCard).getByRole('button', { name: 'Add' }))
    expect(within(goalCard).getByRole('button', { name: 'Add' })).toHaveProperty('disabled', false)
  })

  it('surfaces empty and error recovery states without hiding the create controls', async () => {
    mockFetchGoalsTracking.mockResolvedValueOnce(emptyTrackingFixture)

    renderGoalsPageWithClient()

    expect(await screen.findByText('No goals yet')).toBeTruthy()
    expect(screen.getByText(/Create your first goal and CIBI will track/)).toBeTruthy()
    expect(screen.getByLabelText('Goal name')).toBeTruthy()
    expect(screen.getByLabelText('Target amount')).toBeTruthy()

    cleanup()
    vi.clearAllMocks()
    mockFetchAccounts.mockResolvedValue([accountFixture])
    mockFetchGoalsTracking
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(emptyTrackingFixture)

    renderGoalsPageWithClient()

    const alert = await screen.findByRole('alert', { name: 'Goals tracking error' })
    expect(alert.textContent).toContain('Could not load goals tracking.')
    expect(alert.textContent).toContain('Your saved goals were not changed')

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mockFetchGoalsTracking).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert', { name: 'Goals tracking error' })).not.toBeTruthy())
  })
})
