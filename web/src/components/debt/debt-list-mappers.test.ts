import { describe, expect, it } from 'vitest'
import { calculateNextPayDate, debtStatus, mapFriendDebtsToVM } from '@/components/debt/debt-list-mappers'
import type { PeerDebtResponse } from '@/lib/api'

function makeInstallmentDebt(overrides: Partial<PeerDebtResponse> = {}): PeerDebtResponse {
  return {
    id: 'debt-1',
    account_id: 'acct-1',
    friend_id: 'friend-1',
    amount: -1200,
    description: 'Phone split',
    date: '2026-05-01',
    is_installment: true,
    total_installments: 3,
    paid_installments: 0,
    frequency: 'monthly',
    anchor_date: '2026-05-01T00:00:00Z',
    is_confirmed: false,
    ...overrides,
  }
}

describe('debt-list-mappers installment regression', () => {
  it('does not mark a newly-created installment debt as paid when paid_installments is zero', () => {
    const debt = makeInstallmentDebt()

    expect(debtStatus(debt)).toMatchObject({
      label: '0/3 paid',
      tone: 'secondary',
    })
  })

  it('keeps next payment date for newly-created installment debt', () => {
    const debt = makeInstallmentDebt()

    expect(calculateNextPayDate(debt)).toBe('2026-05-01')

    const [vm] = mapFriendDebtsToVM([debt])
    expect(vm.status.label).toBe('0/3 paid')
    expect(vm.subtitle).toContain('Next payment: 01/05/2026')
  })
})
