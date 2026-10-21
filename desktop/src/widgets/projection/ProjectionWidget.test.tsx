import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectionWidget } from '@/widgets/projection/ProjectionWidget'
import { formatMoney } from '@/lib/format'
import type { ReserveAdjustment } from '@/lib/reserve-adjustment'
import type { AccountResponse, PayScheduleResponse } from '@/lib/api'

afterEach(() => cleanup())

const ACCOUNT: AccountResponse = { id: 'a1', name: 'Main', current_balance: 10000, currency: 'BRL', safety_buffer: 300 }

/** A monthly paycheck 10 days from now. */
function schedule(): PayScheduleResponse {
  const payday = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    id: 's1', account_id: 'a1', frequency: 'monthly', anchor_date: payday, next_payday: payday,
    amount: 5000, day_of_month_2: null, label: null,
  }
}

function renderWidget(reserve: ReserveAdjustment | null) {
  const ps = schedule()
  render(
    <ProjectionWidget
      account={ACCOUNT}
      transactions={[]}
      paySchedules={[ps]}
      friendBreakdown={[]}
      nextPayday={ps.next_payday}
      reserve={reserve}
    />,
  )
}

const flat = (text: string) => text.replace(/\s/g, ' ')
/** Matches an element whose text is exactly the amount, whatever kind of space Intl put after the currency sign. */
const money = (n: number) => (content: string) => flat(content) === flat(formatMoney(n, 'BRL'))

describe('ProjectionWidget', () => {
  it('projects from the balance and the whole paycheck while the reserve is off', () => {
    renderWidget(null)
    expect(screen.queryByText('Separado para a reserva')).toBeNull()
    expect(screen.getByText('Margem de segurança')).toBeTruthy()
    expect(screen.getByText('Saldo inicial previsto')).toBeTruthy()
    expect(screen.getByText(money(10000))).toBeTruthy()
    // 10000 balance + 5000 paycheck
    expect(screen.getByText(money(15000))).toBeTruthy()
  })

  it('leaves the reserve out of the start and takes its share off the paycheck', () => {
    renderWidget({ balance: 400, contributionAt: () => 250 })
    expect(screen.getByText('Separado para a reserva')).toBeTruthy()
    expect(screen.getByText('Saldo inicial previsto (sem a reserva)')).toBeTruthy()
    expect(screen.getByText('Reserva fora do cálculo')).toBeTruthy()
    // The typed buffer no longer applies once the reserve is on.
    expect(screen.queryByText('Margem de segurança')).toBeNull()
    expect(screen.getByText(money(9600))).toBeTruthy()
    // 10000 - 400 reserve + 5000 paycheck - 250 set aside
    expect(screen.getByText(money(14350))).toBeTruthy()
  })
})
