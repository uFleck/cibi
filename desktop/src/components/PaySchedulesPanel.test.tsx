import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { shortcutRegistry } from '@/hooks/useKeyboardShortcuts'
import { confirmPaySchedule, deletePaySchedule, type PayScheduleResponse } from '@/lib/api'
import { PaydayBanner } from './PaydayBanner'
import { PaySchedulesPanel } from './PaySchedulesPanel'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    confirmPaySchedule: vi.fn().mockResolvedValue({}),
    deletePaySchedule: vi.fn().mockResolvedValue(undefined),
    createPaySchedule: vi.fn().mockResolvedValue({}),
    updatePaySchedule: vi.fn().mockResolvedValue(undefined),
  }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const today = new Date().toISOString().slice(0, 10)

const SCHEDULES: PayScheduleResponse[] = [
  { id: 's2', account_id: 'a1', frequency: 'monthly', anchor_date: '2026-01-30', next_payday: '2026-12-30', amount: 500, day_of_month_2: null, label: 'Side gig' },
  { id: 's1', account_id: 'a1', frequency: 'monthly', anchor_date: '2026-01-05', next_payday: today, amount: 3000, day_of_month_2: null, label: 'Main paycheck' },
]

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('PaySchedulesPanel', () => {
  let detach: () => void

  beforeEach(() => {
    detach = shortcutRegistry.attach(document)
    vi.clearAllMocks()
  })

  afterEach(() => {
    detach()
    cleanup()
  })

  function renderPanel(props: Partial<Parameters<typeof PaySchedulesPanel>[0]> = {}) {
    const onCreatingChange = vi.fn()
    renderWith(
      <PaySchedulesPanel
        accountId="a1"
        currency="BRL"
        schedules={SCHEDULES}
        creating={false}
        onCreatingChange={onCreatingChange}
        {...props}
      />,
    )
    return { onCreatingChange }
  }

  it('lists the schedules by next payday as recurring income', () => {
    renderPanel()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Main paycheck')
    expect(rows[1].textContent).toContain('Side gig')
    expect(rows[0].textContent).toContain('recurring income')
  })

  it('marks a schedule received from its row action', async () => {
    renderPanel()
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark received' })[0])
    await waitFor(() => expect(vi.mocked(confirmPaySchedule).mock.calls[0]?.[0]).toBe('s1'))
  })

  it('deletes only after the confirm dialog', async () => {
    renderPanel()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(deletePaySchedule).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(vi.mocked(deletePaySchedule).mock.calls[0]?.[0]).toBe('s1'))
  })

  it('opens the new schedule sheet from the button', () => {
    const { onCreatingChange } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /new schedule/i }))
    expect(onCreatingChange).toHaveBeenCalledWith(true)
  })

  it('shows an empty hint with no schedules', () => {
    renderPanel({ schedules: [] })
    expect(screen.getByText(/No pay schedules yet/)).toBeTruthy()
  })
})

describe('PaydayBanner', () => {
  afterEach(cleanup)

  it('offers Mark received only for schedules paying today', async () => {
    renderWith(<PaydayBanner schedules={SCHEDULES} />)
    expect(screen.getByText('Payday today')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Mark received/ }))
    await waitFor(() => expect(vi.mocked(confirmPaySchedule).mock.calls[0]?.[0]).toBe('s1'))
  })

  it('renders nothing when no schedule pays today', () => {
    renderWith(<PaydayBanner schedules={[SCHEDULES[0]]} />)
    expect(screen.queryByText('Payday today')).toBeNull()
  })
})
