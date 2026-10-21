import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateInput } from '@/components/ui/date-input'

describe('DateInput', () => {
  afterEach(() => {
    cleanup()
  })

  it('commits a typed day and month on blur as ISO and shows it in BR format', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const year = new Date().getFullYear()
    render(<DateInput id="d" aria-label="Date" value="" onChange={onChange} />)

    const input = screen.getByLabelText('Date') as HTMLInputElement
    await user.type(input, '1511')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(`${year}-11-15`)
    expect(input.value).toBe(`15/11/${year}`)
  })

  it('commits on Enter without submitting the surrounding form', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const year = new Date().getFullYear()
    render(
      <form onSubmit={onSubmit}>
        <DateInput aria-label="Date" value="" onChange={onChange} />
      </form>
    )

    await user.type(screen.getByLabelText('Date'), '1511{Enter}')

    expect(onChange).toHaveBeenCalledWith(`${year}-11-15`)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows an invalid hint and keeps the draft for an impossible date', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput aria-label="Date" value="" onChange={onChange} />)

    const input = screen.getByLabelText('Date')
    await user.type(input, '31/02')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Data inválida')).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect((input as HTMLInputElement).value).toBe('31/02')
  })

  it('clears the value when the draft is emptied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput aria-label="Date" value="2026-11-15" onChange={onChange} />)

    const input = screen.getByLabelText('Date') as HTMLInputElement
    expect(input.value).toBe('15/11/2026')
    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('shows an external value in BR format', () => {
    render(<DateInput aria-label="Date" value="2026-11-15" onChange={vi.fn()} />)

    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('15/11/2026')
  })
})
