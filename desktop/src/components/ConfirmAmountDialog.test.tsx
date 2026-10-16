import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmAmountDialog } from './ConfirmAmountDialog'

function setup(over: Partial<Parameters<typeof ConfirmAmountDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmAmountDialog open title="Market" suggested={-250.5} samples={4} onConfirm={onConfirm} onCancel={onCancel} {...over} />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmAmountDialog', () => {
  it('starts from the estimate and confirms it as an expense', () => {
    const { onConfirm } = setup()
    const input = screen.getByLabelText('Amount paid') as HTMLInputElement
    expect(input.value).toBe('250.50')
    expect(screen.getByText(/median of your last 4 matching payments/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
    expect(onConfirm).toHaveBeenCalledWith(-250.5)
  })

  it('keeps the sign of the transaction whatever the user types', () => {
    const { onConfirm } = setup()
    fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: '312.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
    expect(onConfirm).toHaveBeenCalledWith(-312.9)
  })

  it('cannot confirm an empty or zero amount', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: '0' } })
    expect((screen.getByRole('button', { name: 'Mark paid' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('says so when there is no history to estimate from', () => {
    setup({ samples: 0 })
    expect(screen.getByText(/no past payments/)).toBeTruthy()
  })
})
