import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ObligationsList } from './ObligationsList'

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
})
