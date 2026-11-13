import { describe, expect, it } from 'vitest'
import { DEFAULT_KINDS, billKind, countKinds, entryKind, kindVisible, parseKinds } from './bill-kinds'

const fixed = { is_recurring: true, is_installment: false }
const oneOff = { is_recurring: false, is_installment: false }
const parcel = { is_recurring: true, is_installment: true }
const budget = { is_recurring: true, is_installment: false, is_as_needed: true }

describe('billKind', () => {
  it('tells the four types apart', () => {
    expect(billKind(fixed)).toBe('fixed')
    expect(billKind(oneOff)).toBe('one-off')
    expect(billKind(parcel)).toBe('installment')
    expect(billKind(budget)).toBe('budget')
  })
})

describe('entryKind', () => {
  const bills = new Map([['b-fixed', fixed], ['b-once', oneOff]])
  const pay = { id: 'e1', transaction_id: 'b-once', reverses_entry_id: null }
  const reversal = { id: 'e2', transaction_id: null, reverses_entry_id: 'e1' }
  const payday = { id: 'e3', transaction_id: null, reverses_entry_id: null }
  const entries = new Map([pay, reversal, payday].map(e => [e.id, e]))

  it('uses the bill behind the entry', () => {
    expect(entryKind(pay, bills, entries)).toBe('one-off')
  })

  it('gives a reversal the type of what it reverses', () => {
    expect(entryKind(reversal, bills, entries)).toBe('one-off')
  })

  it('is null when no bill backs the entry', () => {
    expect(entryKind(payday, bills, entries)).toBeNull()
  })
})

describe('filter state', () => {
  it('hides one-offs by default', () => {
    expect(DEFAULT_KINDS).not.toContain('one-off')
    expect(parseKinds(null)).toEqual([...DEFAULT_KINDS])
  })

  it('reads a saved choice and drops junk', () => {
    expect(parseKinds('["one-off","nope","fixed"]')).toEqual(['one-off', 'fixed'])
    expect(parseKinds('[]')).toEqual([])
    expect(parseKinds('{bad')).toEqual([...DEFAULT_KINDS])
  })

  it('always shows rows that are not bills', () => {
    expect(kindVisible(null, new Set())).toBe(true)
    expect(kindVisible('one-off', new Set(['fixed']))).toBe(false)
  })

  it('counts each type', () => {
    expect(countKinds(['fixed', 'fixed', null, 'one-off'])).toEqual({ fixed: 2, installment: 0, budget: 0, 'one-off': 1 })
  })
})
