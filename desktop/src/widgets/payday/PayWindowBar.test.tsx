import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PayWindowBar } from './PayWindowBar'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

describe('PayWindowBar empty state', () => {
  afterEach(() => {
    cleanup()
  })

  it('asks for a pay schedule and links to accounts when none exists', () => {
    render(<PayWindowBar nextPayday={null} paySchedules={[]} />)

    expect(screen.getByText('No pay schedule yet. Add one to see your next payday.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add pay schedule' }).getAttribute('href')).toBe('/accounts')
  })
})
