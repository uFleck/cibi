import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BudgetWidget } from '@/widgets/budget/BudgetWidget'
import { monthKey } from '@/widgets/categories/spend'
import { addBudgetExclusion, fetchBudget, removeBudgetExclusion, type BudgetResponse } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { requestShellAction } from '@/shell/shellActions'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    fetchBudget: vi.fn(),
    addBudgetExclusion: vi.fn(),
    removeBudgetExclusion: vi.fn(),
  }
})

vi.mock('@/shell/shellActions', async () => {
  const actual = await vi.importActual<typeof import('@/shell/shellActions')>('@/shell/shellActions')
  return {
    ...actual,
    requestShellAction: vi.fn(),
  }
})

const mockFetchBudget = vi.mocked(fetchBudget)
const mockAdd = vi.mocked(addBudgetExclusion)
const mockRemove = vi.mocked(removeBudgetExclusion)
const mockRequestShellAction = vi.mocked(requestShellAction)

const MONTH = monthKey(new Date())

function budgetFixture(overrides: Partial<BudgetResponse> = {}, excluded = false): BudgetResponse {
  return {
    month: MONTH,
    totals: { limit: 410000, spent: 293000, scheduled: 95000, left: 22000 },
    pace: { day: 15, daysInMonth: 30, ratio: 0.5 },
    rows: [
      { category: 'Groceries', limit: 80000, isFixed: false, spent: 91000, scheduled: 0, status: 'over' },
      { category: 'Food', limit: 50000, isFixed: false, spent: 30000, scheduled: 0, status: 'ahead' },
      { category: 'Transport', limit: 40000, isFixed: false, spent: 10000, scheduled: 5000, status: 'ok' },
      { category: 'Housing', limit: 240000, isFixed: true, spent: 150000, scheduled: 90000, status: 'ok' },
      { category: 'Shopping', limit: null, isFixed: false, spent: 12000, scheduled: 0, status: null },
    ],
    bills: [
      { transactionId: 'tx-1', description: 'Internet', category: 'Transport', amount: 5000, dueDate: '2026-10-12', excluded },
      { transactionId: 'tx-2', description: 'Rent', category: 'Housing', amount: 90000, dueDate: '2026-10-05', excluded: false },
    ],
    categories: [],
    ...overrides,
  }
}

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BudgetWidget currency="BRL" />
    </QueryClientProvider>,
  )
}

const money = (cents: number) => formatMoney(cents / 100, 'BRL').replace(/\s/g, ' ')

beforeEach(() => {
  mockFetchBudget.mockReset()
  mockAdd.mockReset()
  mockRemove.mockReset()
  mockRequestShellAction.mockReset()
})

afterEach(cleanup)

describe('BudgetWidget', () => {
  it('renders the summary figures, the pace tick and a row per budgeted category', async () => {
    mockFetchBudget.mockResolvedValue(budgetFixture())
    renderWidget()

    expect(await screen.findByText(money(293000))).toBeTruthy()
    expect(screen.getAllByText(money(95000)).length).toBeGreaterThan(0)
    expect(screen.getByText(money(22000))).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(mockFetchBudget).toHaveBeenCalledWith(MONTH)

    const [overallTick, ...rowTicks] = screen.getAllByTestId('pace-tick') as HTMLElement[]
    expect(overallTick.style.left).toBe('50%')
    expect(rowTicks.length).toBe(4)
    rowTicks.forEach(tick => expect(tick.style.left).toBe('50%'))

    expect(screen.getByText('Over budget')).toBeTruthy()
    expect(screen.getByText('Ahead of pace')).toBeTruthy()
    expect(screen.getAllByText('On track')).toHaveLength(2)
    expect(screen.getByText('Fixed')).toBeTruthy()
    expect(screen.getByText('Shopping')).toBeTruthy()

    const groceries = screen.getByText('Groceries').closest('li') as HTMLElement
    expect(within(groceries).getByText('Over budget')).toBeTruthy()
    const groceriesText = groceries.textContent?.replace(/\s/g, ' ') ?? ''
    expect(groceriesText).toContain(money(91000))
    expect(groceriesText).toContain(money(80000))
  })

  it('shows the Left figure negative-tinted when below zero', async () => {
    mockFetchBudget.mockResolvedValue(
      budgetFixture({ totals: { limit: 100000, spent: 90000, scheduled: 30000, left: -20000 } }),
    )
    renderWidget()

    const left = await screen.findByText(money(-20000))
    expect(left.className).toContain('text-neg')
  })

  it('shows the empty state and opens the budget editor from Set limits', async () => {
    mockFetchBudget.mockResolvedValue(
      budgetFixture({
        rows: [{ category: 'Shopping', limit: null, isFixed: false, spent: 12000, scheduled: 0, status: null }],
      }),
    )
    renderWidget()

    expect(await screen.findByText('Set monthly limits to track spending against your budget.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Set limits' }))
    expect(mockRequestShellAction).toHaveBeenCalledWith('open-budget')
  })

  it('opens the budget editor from Edit', async () => {
    mockFetchBudget.mockResolvedValue(budgetFixture())
    renderWidget()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(mockRequestShellAction).toHaveBeenCalledWith('open-budget')
  })

  it('excludes a bill when unchecked, refetches, and includes it again when checked', async () => {
    let excluded = false
    mockFetchBudget.mockImplementation(async () => budgetFixture({}, excluded))
    mockAdd.mockImplementation(async () => {
      excluded = true
    })
    mockRemove.mockImplementation(async () => {
      excluded = false
    })
    renderWidget()

    fireEvent.click(await screen.findByRole('button', { name: /Scheduled bills/ }))
    const internet = screen.getByRole('checkbox', { name: 'Count Internet' }) as HTMLInputElement
    expect(internet.checked).toBe(true)

    fireEvent.click(internet)
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('tx-1', MONTH))
    await waitFor(() => expect(mockFetchBudget).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      const label = screen.getByText('Internet')
      expect(label.className).toContain('line-through')
    })
    expect((screen.getByRole('checkbox', { name: 'Count Internet' }) as HTMLInputElement).checked).toBe(false)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Count Internet' }))
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('tx-1', MONTH))
    await waitFor(() => expect(mockFetchBudget).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByText('Internet').className).not.toContain('line-through'))
  })

  it('shows the empty bills message when there are no scheduled bills', async () => {
    mockFetchBudget.mockResolvedValue(budgetFixture({ bills: [] }))
    renderWidget()

    fireEvent.click(await screen.findByRole('button', { name: /Scheduled bills/ }))
    expect(screen.getByText('No scheduled bills this month.')).toBeTruthy()
  })
})
