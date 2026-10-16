import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBudget, saveBudgetLimits, type BudgetResponse } from '@/lib/api'
import { requestShellAction } from '@/shell/shellActions'
import { toast } from 'sonner'
import { monthKey } from '@/widgets/categories/spend'
import { BudgetEditor } from './BudgetEditor'

vi.mock('@/lib/api', () => ({
  fetchAccounts: vi.fn(async () => [
    { id: 'a1', name: 'Main', current_balance: 0, currency: 'BRL', safety_buffer: 0 },
  ]),
  fetchBudget: vi.fn(),
  saveBudgetLimits: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const RESPONSE: BudgetResponse = {
  month: monthKey(new Date()),
  totals: { limit: 105050, spent: 62000, scheduled: 0, left: 43050 },
  pace: { day: 16, daysInMonth: 31, ratio: 16 / 31 },
  rows: [
    { category: 'Mercado', limit: 80000, isFixed: false, spent: 12000, scheduled: 0, status: 'ok' },
    { category: 'Moradia', limit: null, isFixed: false, spent: 50000, scheduled: 0, status: null },
    { category: 'Contas e serviços', limit: 25050, isFixed: true, spent: 0, scheduled: 0, status: 'ok' },
  ],
  bills: [],
  categories: [
    { id: 'mercado', label: 'Mercado', description: '' },
    { id: 'moradia', label: 'Moradia', description: '' },
  ],
}

function mockViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function renderEditor() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BudgetEditor />
    </QueryClientProvider>,
  )
}

function openEditor() {
  act(() => requestShellAction('open-budget'))
}

function valuesOf(elements: HTMLElement[]) {
  return elements.map(element => (element as HTMLInputElement).value)
}

function isDisabled(name: string) {
  return (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
}

describe('BudgetEditor', () => {
  beforeEach(() => {
    mockViewport()
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    vi.mocked(fetchBudget).mockResolvedValue(RESPONSE)
    vi.mocked(saveBudgetLimits).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('opens from the open-budget shell action with the title', async () => {
    renderEditor()
    openEditor()

    expect(await screen.findByRole('dialog', { name: 'Monthly budget' })).toBeTruthy()
    expect(fetchBudget).toHaveBeenCalledWith(monthKey(new Date()))
  })

  it('prefills the rows that have a limit, with the limit in reais', async () => {
    renderEditor()
    openEditor()

    expect(valuesOf(await screen.findAllByLabelText('Category'))).toEqual(['Mercado', 'Contas e serviços'])
    expect(valuesOf(screen.getAllByLabelText('Monthly limit'))).toEqual(['800.00', '250.50'])
    expect(screen.getAllByRole('switch').map(item => item.getAttribute('aria-checked'))).toEqual(['false', 'true'])
  })

  it('updates the live total as a limit is typed', async () => {
    renderEditor()
    openEditor()

    expect(await screen.findByText(/1\.050,50/)).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText('Monthly limit')[0], { target: { value: '1000' } })

    expect(screen.getByText(/1\.250,50/)).toBeTruthy()
  })

  it('saves trimmed categories as integer cents and leaves out blank limits', async () => {
    renderEditor()
    openEditor()
    await screen.findAllByLabelText('Category')

    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    fireEvent.change(screen.getAllByLabelText('Category')[2], { target: { value: '  Aluguel  ' } })
    fireEvent.change(screen.getAllByLabelText('Monthly limit')[2], { target: { value: '1.200,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    fireEvent.change(screen.getAllByLabelText('Category')[3], { target: { value: 'Lazer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveBudgetLimits).toHaveBeenCalledWith([
      { category: 'Mercado', monthlyLimit: 80000, isFixed: false },
      { category: 'Contas e serviços', monthlyLimit: 25050, isFixed: true },
      { category: 'Aluguel', monthlyLimit: 120050, isFixed: false },
    ]))
    expect(toast.success).toHaveBeenCalledWith('Budget saved')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('disables Save and shows the message for a duplicate category', async () => {
    renderEditor()
    openEditor()
    await screen.findAllByLabelText('Category')

    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    fireEvent.change(screen.getAllByLabelText('Category')[2], { target: { value: 'Mercado' } })
    fireEvent.change(screen.getAllByLabelText('Monthly limit')[2], { target: { value: '100' } })

    expect(screen.getAllByText('This category is already in the list.')).toHaveLength(2)
    expect(isDisabled('Save')).toBe(true)
  })

  it('disables Save for an unparseable or negative limit', async () => {
    renderEditor()
    openEditor()
    await screen.findAllByLabelText('Category')

    fireEvent.change(screen.getAllByLabelText('Monthly limit')[0], { target: { value: 'abc' } })
    expect(isDisabled('Save')).toBe(true)

    fireEvent.change(screen.getAllByLabelText('Monthly limit')[0], { target: { value: '-5' } })
    expect(isDisabled('Save')).toBe(true)

    fireEvent.change(screen.getAllByLabelText('Monthly limit')[0], { target: { value: '5' } })
    expect(isDisabled('Save')).toBe(false)
  })

  it('fetches a fresh copy on open even when the cached copy is within staleTime', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['budget', monthKey(new Date())], {
      ...RESPONSE,
      rows: [{ category: 'Mercado', limit: 10000, isFixed: false, spent: 0, scheduled: 0, status: 'ok' }],
    })
    vi.mocked(fetchBudget).mockResolvedValue({
      ...RESPONSE,
      rows: [{ category: 'Mercado', limit: 90000, isFixed: false, spent: 0, scheduled: 0, status: 'ok' }],
    })
    render(
      <QueryClientProvider client={client}>
        <BudgetEditor />
      </QueryClientProvider>,
    )
    await new Promise(resolve => setTimeout(resolve, 5))
    openEditor()

    expect(await screen.findByDisplayValue('900.00')).toBeTruthy()
    expect(fetchBudget).toHaveBeenCalledTimes(1)
  })

  it('keeps the typed values when open-budget fires again while the sheet is open', async () => {
    renderEditor()
    openEditor()
    await screen.findAllByLabelText('Category')

    fireEvent.change(screen.getAllByLabelText('Monthly limit')[0], { target: { value: '999' } })
    openEditor()

    expect(valuesOf(screen.getAllByLabelText('Monthly limit'))[0]).toBe('999')
    expect(fetchBudget).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when there is no limit', async () => {
    vi.mocked(fetchBudget).mockResolvedValue({
      ...RESPONSE,
      rows: [{ category: 'Mercado', limit: null, isFixed: false, spent: 0, scheduled: 0, status: null }],
    })
    renderEditor()
    openEditor()

    expect(await screen.findByText('No limits yet. Add a category to start tracking.')).toBeTruthy()
    expect(screen.queryAllByLabelText('Category')).toHaveLength(0)
  })
})
