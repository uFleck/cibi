import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

function Frequency({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('monthly')
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="monthly">Monthly</SelectItem>
        <SelectItem value="weekly">Weekly</SelectItem>
        <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
      </SelectContent>
    </Select>
  )
}

describe('Select', () => {
  it('shows the selected label and picks an option with the mouse', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Frequency onChange={onChange} />)

    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toContain('Monthly')

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'Weekly' }))

    expect(onChange).toHaveBeenCalledWith('weekly')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger.textContent).toContain('Weekly')
  })

  it('moves the highlight with arrow keys and selects with Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Frequency onChange={onChange} />)

    const trigger = screen.getByRole('combobox')
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeTruthy()

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Bi-weekly' }).id,
    )

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('bi-weekly')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on Escape without changing the value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Frequency onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}{Escape}')

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
