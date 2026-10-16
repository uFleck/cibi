import type { ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountResponse } from '@/lib/api'
import { AccountsWidget } from './AccountsWidget'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
  }
})

afterEach(cleanup)

const accounts: AccountResponse[] = [
  { id: 'a1', name: 'Checking', current_balance: 1200, currency: 'BRL', safety_buffer: 0 },
  { id: 'a2', name: 'Savings', current_balance: -50, currency: 'BRL', safety_buffer: 0 },
]

describe('AccountsWidget', () => {
  it('lists every account with its balance', () => {
    render(<AccountsWidget accounts={accounts} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Checking')).toBeTruthy()
    expect(within(rows[1]).getByText('Savings')).toBeTruthy()
  })

  it('says so when there are no accounts', () => {
    render(<AccountsWidget accounts={[]} />)
    expect(screen.getByText('No accounts yet.')).toBeTruthy()
  })

  it('offers a Create account action that links to the accounts page', () => {
    render(<AccountsWidget accounts={[]} />)
    const link = screen.getByRole('link', { name: 'Create account' })
    expect(link.getAttribute('href')).toBe('/accounts')
  })
})
