import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckWidget } from '@/components/CheckWidget'
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

const waitVerdictResult: CheckResponse = {
  can_buy: false,
  purchasing_power: 120,
  buffer_remaining: 75,
  risk_level: 'WAIT',
  will_afford_after_payday: true,
  wait_until: '2026-05-15T00:00:00.000Z',
  goal_impacts: [
    {
      goal_id: 'goal-wait',
      goal_name: 'Vacation fund',
      remaining_before: 300,
      remaining_after: 375,
      progress_before_pct: 70,
      progress_after_pct: 55,
      severity: 'medium',
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

describe('CheckWidget WAIT verdict', () => {
  it('keeps the wait recovery copy and goal impact preview visible together', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue(waitVerdictResult)

    render(<CheckWidget />)

    await user.type(screen.getByPlaceholderText('0.00'), '75')
    await user.click(screen.getByRole('button', { name: 'Check purchase impact' }))

    await waitFor(() => expect(mockPostCheck).toHaveBeenCalledWith(75, undefined))
    expect(await screen.findByText('WAIT')).toBeTruthy()
    expect(screen.getByText("Not yet — you'll have enough after", { exact: false })).toBeTruthy()
    expect(screen.getByLabelText('Goal impact preview')).toBeTruthy()
    expect(screen.getByLabelText('Vacation fund purchase impact')).toBeTruthy()
    expect(screen.getByText('70.0% → 55.0%', { exact: false })).toBeTruthy()
    expect(screen.getByText('Goal progress would drop', { exact: false })).toBeTruthy()
  })
})
