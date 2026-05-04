import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckWidget, LAST_CHECK_RESULT_KEY } from '@/components/CheckWidget'
import { postCheck, type CheckResponse } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    postCheck: vi.fn(),
  }
})

const toastErrorMock = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}))

const mockPostCheck = vi.mocked(postCheck)

const baseResult: CheckResponse = {
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

beforeEach(() => {
  mockPostCheck.mockReset()
  toastErrorMock.mockReset()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('CheckWidget impact wiring', () => {
  it('exports storage key for latest check result handoff', () => {
    expect(LAST_CHECK_RESULT_KEY).toBe('cibi:last-check-result')
  })

  it('keeps check input/button behavior and writes the latest result to sessionStorage', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue(baseResult)

    render(<CheckWidget accountId="acct-1" />)

    await user.type(screen.getByLabelText('Purchase amount'), '50,00')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    await waitFor(() => expect(mockPostCheck).toHaveBeenCalledWith(50, 'acct-1'))
    expect(await screen.findByText('WAIT')).toBeTruthy()
    expect(sessionStorage.getItem(LAST_CHECK_RESULT_KEY)).toBe(JSON.stringify(baseResult))
  })

  it('renders latest goal impact as compact goal-tracking language', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue(baseResult)

    render(<CheckWidget />)

    await user.type(screen.getByLabelText('Purchase amount'), '50')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    expect(await screen.findByLabelText('Emergency fund purchase impact')).toBeTruthy()
    expect(screen.getByLabelText('Goal impact preview')).toBeTruthy()
    expect(screen.getByText('1 affected')).toBeTruthy()
    expect(screen.getByText('Contribution capacity impact')).toBeTruthy()
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.getByText('Min contribution / payment window')).toBeTruthy()
    expect(screen.getByText('This check does not move goal progress.', { exact: false })).toBeTruthy()
    expect(screen.getByText('leaves too little for your minimum window contribution', { exact: false })).toBeTruthy()
  })

  it('keeps latest-impact semantics explicit when no active goals are affected', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue({ ...baseResult, goal_impacts: [] })

    render(<CheckWidget />)

    await user.type(screen.getByLabelText('Purchase amount'), '15')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    expect(await screen.findByLabelText('Goal impact preview')).toBeTruthy()
    expect(screen.getByText('No active goals affected.')).toBeTruthy()
    expect(screen.getByText('no goal progress would move', { exact: false })).toBeTruthy()
  })

  it('shows covered goals when current window minimum was already met', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue({
      ...baseResult,
      goal_impacts: [],
      goals_covered_this_window: [
        {
          goal_id: 'goal-2',
          goal_name: 'Vacation fund',
          contributed_this_window: 250,
          min_contribution_per_window: 200,
        },
      ],
    })

    render(<CheckWidget />)

    await user.type(screen.getByLabelText('Purchase amount'), '12')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    expect(await screen.findByLabelText('Goals already covered this window')).toBeTruthy()
    expect(screen.getByText('Already covered this window')).toBeTruthy()
    expect(screen.getByText('Vacation fund')).toBeTruthy()
  })

  it('keeps pending state disabled until the API call resolves', async () => {
    const user = userEvent.setup()
    let resolveCheck!: (value: CheckResponse) => void
    mockPostCheck.mockReturnValue(new Promise<CheckResponse>(resolve => { resolveCheck = resolve }))

    render(<CheckWidget />)

    expect(screen.getByLabelText('Purchase amount')).toBeTruthy()
    await user.type(screen.getByLabelText('Purchase amount'), '25')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    const input = screen.getByLabelText('Purchase amount') as HTMLInputElement
    const button = screen.getByRole('button', { name: 'Checking purchase impact' }) as HTMLButtonElement
    expect(screen.getByRole('status').textContent).toContain('Checking this purchase against your cash flow')
    expect(input.disabled).toBe(true)
    expect(button.disabled).toBe(true)

    resolveCheck({ ...baseResult, can_buy: true, risk_level: 'LOW', will_afford_after_payday: false, wait_until: null })

    expect(await screen.findByText('YES')).toBeTruthy()
  })

  it('keeps retry/recovery readable after API failures', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(baseResult)

    render(<CheckWidget />)

    await user.type(screen.getByLabelText('Purchase amount'), '25')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Something went wrong. Try again.'))
    const alert = screen.getByRole('alert', { name: 'Purchase check error' })
    expect(alert.textContent).toContain('Could not check purchase impact.')
    expect(alert.textContent).toContain('Something went wrong. Try again when the connection is ready.')
    expect(screen.getByLabelText('Purchase amount').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('button', { name: 'Check purchase impact' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    expect(await screen.findByText('WAIT')).toBeTruthy()
    expect(mockPostCheck).toHaveBeenCalledTimes(2)
  })

  it('resets to the input surface when checking another amount', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue(baseResult)

    render(<CheckWidget />)

    await user.type(screen.getByLabelText('Purchase amount'), '25')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))
    await user.click(await screen.findByText('Check another'))

    const input = screen.getByLabelText('Purchase amount') as HTMLInputElement
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: 'Check purchase impact' })).toBeTruthy()
  })

  it('supports Enter key submission without changing check-flow semantics', async () => {
    mockPostCheck.mockResolvedValue(baseResult)

    render(<CheckWidget />)

    fireEvent.change(screen.getByLabelText('Purchase amount'), { target: { value: '33' } })
    fireEvent.keyDown(screen.getByLabelText('Purchase amount'), { key: 'Enter' })

    await waitFor(() => expect(mockPostCheck).toHaveBeenCalledWith(33, undefined))
  })
})
