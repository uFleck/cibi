import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ObligationsList } from './ObligationsList'
import type { TransactionResponse } from '@/lib/api'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
  }
})

afterEach(cleanup)

describe('ObligationsList', () => {
  it('offers an Add recurring bill link when there are no obligations', () => {
    render(<ObligationsList transactions={[]} nextPayday={null} />)

    expect(screen.getByText('No upcoming obligations.')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Add recurring bill' })
    expect(link.getAttribute('href')).toBe('/transactions')
  })

  it('truncates a very long description on one line and exposes the full text as title', () => {
    const description = 'Assinatura anual do software de contabilidade '.repeat(7).trim()
    const transaction: TransactionResponse = {
      id: 'tx-long',
      account_id: 'acc-1',
      type: 'personal',
      amount: -120,
      description,
      category: null,
      timestamp: '2026-09-01T00:00:00Z',
      is_recurring: true,
      requires_confirmation: false,
      confirmed_at: null,
      frequency: 'monthly',
      anchor_date: '2026-09-01',
      next_occurrence: '2026-10-10T00:00:00Z',
      is_installment: false,
      total_installments: null,
      paid_installments: 0,
    }

    render(<ObligationsList transactions={[transaction]} nextPayday="2026-10-20" />)

    const label = screen.getByText(description)
    expect(label.classList.contains('truncate')).toBe(true)
    expect(label.getAttribute('title')).toBe(description)
  })
})
