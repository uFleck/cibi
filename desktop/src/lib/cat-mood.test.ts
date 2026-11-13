import { describe, expect, it } from 'vitest'
import { moneyMood, paycheckOf } from './cat-mood'

describe('moneyMood', () => {
  it('gets sadder as less of the paycheck is free', () => {
    expect(moneyMood(4000, 10000)).toBe('party')
    expect(moneyMood(2000, 10000)).toBe('happy')
    expect(moneyMood(1000, 10000)).toBe('okay')
    expect(moneyMood(999, 10000)).toBe('worried')
    expect(moneyMood(0, 10000)).toBe('worried')
    expect(moneyMood(-1, 10000)).toBe('sad')
  })

  it('only tells short from not short without a paycheck', () => {
    expect(moneyMood(500, 0)).toBe('okay')
    expect(moneyMood(0, 0)).toBe('worried')
    expect(moneyMood(-500, 0)).toBe('sad')
  })
})

describe('paycheckOf', () => {
  it('uses the first period with income', () => {
    expect(paycheckOf([{ income: 0 }, { income: 5000 }, { income: 7000 }])).toBe(5000)
    expect(paycheckOf([{ income: 0 }])).toBe(0)
  })
})
