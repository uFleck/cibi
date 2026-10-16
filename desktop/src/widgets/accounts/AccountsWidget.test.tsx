import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountResponse } from '@/lib/api'
import { AccountsWidget } from './AccountsWidget'

afterEach(cleanup)

const accounts: AccountResponse[] = [
  { id: 'a1', name: 'Checking', current_balance: 1200, currency: 'BRL', is_default: true, safety_buffer: 0 },
  { id: 'a2', name: 'Savings', current_balance: -50, currency: 'BRL', is_default: false, safety_buffer: 0 },
]

describe('AccountsWidget', () => {
  it('lists every account with its balance and marks the default', () => {
    render(<AccountsWidget accounts={accounts} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Checking')).toBeTruthy()
    expect(within(rows[0]).getByText('default')).toBeTruthy()
    expect(within(rows[1]).queryByText('default')).toBeNull()
    expect(within(rows[1]).getByText('Savings')).toBeTruthy()
  })

  it('says so when there are no accounts', () => {
    render(<AccountsWidget accounts={[]} />)
    expect(screen.getByText('No accounts yet.')).toBeTruthy()
  })
})
