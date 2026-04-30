import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SharedDebtList } from '@/components/debt/shared-debt-list'
import type { DebtListItemVM } from '@/components/debt/shared-debt-list.types'

const baseItems: DebtListItemVM[] = [
  {
    id: 'd1',
    title: 'Rent',
    subtitle: '2026-04-20',
    amount: -500,
    currency: 'BRL',
    status: { label: 'Unpaid', tone: 'outline' },
    canConfirm: true,
    canDelete: true,
    canCopy: false,
  },
]

describe('SharedDebtList', () => {
  it('renders loading state with 3 skeleton rows', () => {
    render(<SharedDebtList view="owner" items={[]} loading />)
    expect(screen.getByTestId('shared-debt-list-loading')).toBeTruthy()
    expect(document.querySelectorAll('.animate-pulse').length).toBe(3)
  })

  it('renders empty state', () => {
    render(<SharedDebtList view="owner" items={[]} emptyTitle="No debts" emptyHint="Add one" />)
    expect(screen.getByText('No debts')).toBeTruthy()
    expect(screen.getByText('Add one')).toBeTruthy()
  })

  it('renders error state and retry callback', () => {
    const onRetry = vi.fn()
    render(<SharedDebtList view="owner" items={[]} error="boom" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders actions only when capability + callback exist', () => {
    const onConfirm = vi.fn()
    const onDelete = vi.fn()
    render(<SharedDebtList view="owner" items={baseItems} mode="mobile" onConfirm={onConfirm} onDelete={onDelete} />)

    expect(screen.getByLabelText('Confirm')).toBeTruthy()
    expect(screen.getByLabelText('Delete')).toBeTruthy()
    expect(screen.queryByLabelText('Copy')).toBeNull()
  })

})
