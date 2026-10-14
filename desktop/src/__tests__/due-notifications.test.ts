import { beforeEach, describe, expect, it } from 'vitest'
import type { GoalRecurringDueItemResponse, PayScheduleResponse, TransactionResponse } from '@/lib/api'
import {
  collectDueItems,
  formatDueNotification,
  loadNotifiedKeys,
  notifiedDayKey,
  saveNotifiedKeys,
  type AccountDueData,
} from '@/lib/due-notifications'

const now = new Date('2026-10-14T12:00:00Z')

const paySchedule = (overrides: Partial<PayScheduleResponse>): PayScheduleResponse => ({
  id: 'ps-1',
  account_id: 'acc-1',
  frequency: 'monthly',
  anchor_date: '2026-04-14',
  next_payday: '2026-11-14',
  amount: 3000,
  day_of_month_2: null,
  label: 'Salary',
  ...overrides,
})

const txn = (overrides: Partial<TransactionResponse>): TransactionResponse => ({
  id: 't-1',
  account_id: 'acc-1',
  type: 'personal',
  amount: -100,
  description: 'Rent',
  category: 'General',
  timestamp: '2026-04-10T00:00:00Z',
  is_recurring: true,
  requires_confirmation: false,
  confirmed_at: null,
  frequency: 'monthly',
  anchor_date: '2026-04-14T00:00:00Z',
  next_occurrence: '2026-10-14T00:00:00Z',
  is_installment: false,
  total_installments: null,
  paid_installments: 0,
  ...overrides,
})

const goalDue = (overrides: Partial<GoalRecurringDueItemResponse>): GoalRecurringDueItemResponse => ({
  id: 'g-1',
  goal_id: 'goal-1',
  goal_name: 'Emergency fund',
  amount: 50,
  frequency: 'monthly',
  anchor_date_utc: '2026-04-14T00:00:00Z',
  next_due_utc: '2026-10-14T00:00:00Z',
  is_overdue: false,
  last_entry_id: null,
  last_posted_at_utc: null,
  ...overrides,
})

const account = (overrides: Partial<AccountDueData>): AccountDueData => ({
  paySchedules: [],
  transactions: [],
  goalRecurring: [],
  ...overrides,
})

const noneNotified = new Set<string>()

describe('collectDueItems', () => {
  it('reports a recurring transaction due today', () => {
    const items = collectDueItems({
      now,
      accounts: [account({ transactions: [txn({ id: 't-today', description: 'Rent' })] })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([{ key: 'txn:t-today', label: 'Rent' }])
  })

  it('reports a recurring transaction due yesterday (overdue, not confirmed)', () => {
    const items = collectDueItems({
      now,
      accounts: [account({
        transactions: [txn({ id: 't-late', next_occurrence: '2026-10-13T00:00:00Z' })],
      })],
      notifiedKeys: noneNotified,
    })
    expect(items.map(i => i.key)).toEqual(['txn:t-late'])
  })

  it('does not report a recurring transaction that is not yet due', () => {
    const items = collectDueItems({
      now,
      accounts: [account({
        transactions: [txn({ next_occurrence: '2026-10-15T00:00:00Z' })],
      })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([])
  })

  it('does not report a recurring transaction that was already confirmed (next occurrence moved on)', () => {
    const items = collectDueItems({
      now,
      accounts: [account({
        transactions: [txn({ next_occurrence: '2026-11-14T00:00:00Z' })],
      })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([])
  })

  it('reports an unpaid installment due today and skips a finished installment plan', () => {
    const items = collectDueItems({
      now,
      accounts: [account({
        transactions: [
          txn({ id: 'i-open', is_recurring: false, is_installment: true, total_installments: 6, paid_installments: 2, description: 'Phone' }),
          txn({ id: 'i-done', is_recurring: false, is_installment: true, total_installments: 3, paid_installments: 3 }),
        ],
      })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([{ key: 'txn:i-open', label: 'Phone' }])
  })

  it('ignores one-time transactions', () => {
    const items = collectDueItems({
      now,
      accounts: [account({
        transactions: [txn({ is_recurring: false, requires_confirmation: true, next_occurrence: null, anchor_date: '2026-10-14T00:00:00Z' })],
      })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([])
  })

  it('reports a pay schedule whose payday falls today, with its label', () => {
    const items = collectDueItems({
      now,
      accounts: [account({ paySchedules: [paySchedule({ id: 'ps-today' })] })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([{ key: 'pay:ps-today', label: 'Salary' }])
  })

  it('does not report a pay schedule whose payday is another day', () => {
    const items = collectDueItems({
      now,
      accounts: [account({ paySchedules: [paySchedule({ anchor_date: '2026-04-15' })] })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([])
  })

  it('reports due recurring goal contributions', () => {
    const items = collectDueItems({
      now,
      accounts: [account({ goalRecurring: [goalDue({ id: 'g-9' })] })],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([{ key: 'goal:g-9', label: 'Emergency fund contribution' }])
  })

  it('filters out items already notified today', () => {
    const items = collectDueItems({
      now,
      accounts: [account({
        paySchedules: [paySchedule({ id: 'ps-1' })],
        transactions: [txn({ id: 't-1' }), txn({ id: 't-2', description: 'Gym' })],
        goalRecurring: [goalDue({ id: 'g-1' })],
      })],
      notifiedKeys: new Set(['pay:ps-1', 'txn:t-1', 'goal:g-1']),
    })
    expect(items).toEqual([{ key: 'txn:t-2', label: 'Gym' }])
  })

  it('collects items from multiple accounts', () => {
    const items = collectDueItems({
      now,
      accounts: [
        account({ transactions: [txn({ id: 't-a', description: 'Rent A' })] }),
        account({ transactions: [txn({ id: 't-b', description: 'Rent B' })], goalRecurring: [goalDue({ id: 'g-b', goal_name: 'Trip' })] }),
        account({}),
      ],
      notifiedKeys: noneNotified,
    })
    expect(items).toEqual([
      { key: 'txn:t-a', label: 'Rent A' },
      { key: 'txn:t-b', label: 'Rent B' },
      { key: 'goal:g-b', label: 'Trip contribution' },
    ])
  })
})

describe('formatDueNotification', () => {
  it('uses singular and plural titles', () => {
    expect(formatDueNotification(['Rent']).title).toBe('cibi: 1 item due')
    expect(formatDueNotification(['Rent', 'Gym']).title).toBe('cibi: 2 items due')
  })

  it('lists up to three names with no suffix', () => {
    expect(formatDueNotification(['A', 'B', 'C'])).toEqual({ title: 'cibi: 3 items due', body: 'A, B, C' })
  })

  it.each([
    [['A', 'B', 'C', 'D'], 'A, B, C, +1 more'],
    [['A', 'B', 'C', 'D', 'E', 'F'], 'A, B, C, +3 more'],
  ])('truncates the names and adds +K more (%j)', (labels, body) => {
    expect(formatDueNotification(labels).body).toBe(body)
  })
})

describe('notified keys storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keys by the UTC calendar day', () => {
    expect(notifiedDayKey(now)).toBe('cibi.due.notified.2026-10-14')
    expect(notifiedDayKey(new Date('2026-10-14T23:59:00Z'))).toBe('cibi.due.notified.2026-10-14')
  })

  it('saves and loads today keys, and drops the keys of other days', () => {
    window.localStorage.setItem('cibi.due.notified.2026-10-12', JSON.stringify(['txn:old']))
    window.localStorage.setItem('cibi.theme', 'dark')
    saveNotifiedKeys(window.localStorage, now, new Set(['txn:t-1', 'pay:ps-1']))

    const keys = loadNotifiedKeys(window.localStorage, now)

    expect([...keys].sort()).toEqual(['pay:ps-1', 'txn:t-1'])
    expect(window.localStorage.getItem('cibi.due.notified.2026-10-12')).toBeNull()
    expect(window.localStorage.getItem('cibi.theme')).toBe('dark')
  })

  it('starts empty on a new day, so yesterday notifications do not suppress today', () => {
    saveNotifiedKeys(window.localStorage, new Date('2026-10-13T12:00:00Z'), new Set(['txn:t-1']))
    expect(loadNotifiedKeys(window.localStorage, now).size).toBe(0)
  })
})
