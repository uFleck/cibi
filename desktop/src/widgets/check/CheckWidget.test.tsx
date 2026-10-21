import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckWidget, LAST_CHECK_RESULT_KEY } from '@/widgets/check/CheckWidget'
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

    await user.type(screen.getByLabelText('Valor da compra'), '50,00')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    await waitFor(() => expect(mockPostCheck).toHaveBeenCalledWith(50, 'acct-1'))
    expect(await screen.findByText('AGUARDE')).toBeTruthy()
    expect(sessionStorage.getItem(LAST_CHECK_RESULT_KEY)).toBe(JSON.stringify(baseResult))
  })

  it('renders latest goal impact as compact goal-tracking language', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue(baseResult)

    render(<CheckWidget accountId="acct-1" />)

    await user.type(screen.getByLabelText('Valor da compra'), '50')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    expect(await screen.findByLabelText('Impacto da compra em Emergency fund')).toBeTruthy()
    expect(screen.getByLabelText('Prévia do impacto nas metas')).toBeTruthy()
    expect(screen.getByText('1 afetadas')).toBeTruthy()
    expect(screen.getByText('Impacto na capacidade de aporte')).toBeTruthy()
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.getByText('Aporte mínimo no período')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('Esta verificação não altera o progresso da meta.'))).toBeTruthy()
    expect(screen.getByText('deixa pouco para o aporte mínimo do período', { exact: false })).toBeTruthy()
  })

  it('keeps latest-impact semantics explicit when no active goals are affected', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue({ ...baseResult, goal_impacts: [] })

    render(<CheckWidget accountId="acct-1" />)

    await user.type(screen.getByLabelText('Valor da compra'), '15')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    expect(await screen.findByLabelText('Prévia do impacto nas metas')).toBeTruthy()
    expect(screen.getByText('Nenhuma meta ativa afetada.')).toBeTruthy()
    expect(screen.getByText('nenhum progresso de meta muda', { exact: false })).toBeTruthy()
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

    render(<CheckWidget accountId="acct-1" />)

    await user.type(screen.getByLabelText('Valor da compra'), '12')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    expect(await screen.findByLabelText('Metas já cobertas neste período')).toBeTruthy()
    expect(screen.getByText('Já coberto neste período')).toBeTruthy()
    expect(screen.getByText('Vacation fund')).toBeTruthy()
  })

  it('keeps pending state disabled until the API call resolves', async () => {
    const user = userEvent.setup()
    let resolveCheck!: (value: CheckResponse) => void
    mockPostCheck.mockReturnValue(new Promise<CheckResponse>(resolve => { resolveCheck = resolve }))

    render(<CheckWidget accountId="acct-1" />)

    expect(screen.getByLabelText('Valor da compra')).toBeTruthy()
    await user.type(screen.getByLabelText('Valor da compra'), '25')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    const input = screen.getByLabelText('Valor da compra') as HTMLInputElement
    const button = screen.getByRole('button', { name: 'Verificando impacto da compra' }) as HTMLButtonElement
    expect(screen.getByRole('status').textContent).toContain('Verificando esta compra com seu fluxo de caixa')
    expect(input.disabled).toBe(true)
    expect(button.disabled).toBe(true)

    resolveCheck({ ...baseResult, can_buy: true, risk_level: 'LOW', will_afford_after_payday: false, wait_until: null })

    expect(await screen.findByText('SIM')).toBeTruthy()
  })

  it('keeps retry/recovery readable after API failures', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(baseResult)

    render(<CheckWidget accountId="acct-1" />)

    await user.type(screen.getByLabelText('Valor da compra'), '25')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Algo deu errado. Tente de novo.'))
    const alert = screen.getByRole('alert', { name: 'Erro na verificação da compra' })
    expect(alert.textContent).toContain('Não deu para verificar o impacto da compra.')
    expect(alert.textContent).toContain('Algo deu errado. Tente de novo quando a conexão estiver disponível.')
    expect(screen.getByLabelText('Valor da compra').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('button', { name: 'Verificar impacto da compra' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))

    expect(await screen.findByText('AGUARDE')).toBeTruthy()
    expect(mockPostCheck).toHaveBeenCalledTimes(2)
  })

  it('resets to the input surface when checking another amount', async () => {
    const user = userEvent.setup()
    mockPostCheck.mockResolvedValue(baseResult)

    render(<CheckWidget accountId="acct-1" />)

    await user.type(screen.getByLabelText('Valor da compra'), '25')
    await user.click(screen.getByRole('button', { name: 'Verificar impacto da compra' }))
    await user.click(await screen.findByText('Verificar outra'))

    const input = screen.getByLabelText('Valor da compra') as HTMLInputElement
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: 'Verificar impacto da compra' })).toBeTruthy()
  })

  it('supports Enter key submission without changing check-flow semantics', async () => {
    mockPostCheck.mockResolvedValue(baseResult)

    render(<CheckWidget accountId="acct-1" />)

    fireEvent.change(screen.getByLabelText('Valor da compra'), { target: { value: '33' } })
    fireEvent.keyDown(screen.getByLabelText('Valor da compra'), { key: 'Enter' })

    await waitFor(() => expect(mockPostCheck).toHaveBeenCalledWith(33, 'acct-1'))
  })
})
