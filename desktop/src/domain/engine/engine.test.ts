import { describe, expect, it } from 'vitest'
import { date } from '../dates'
import {
  addMonthClamped,
  FREQ_BI_WEEKLY,
  FREQ_MONTHLY,
  FREQ_SEMI_MONTHLY,
  FREQ_WEEKLY,
  nextPayday,
  type PaySchedule,
} from './engine'

// Port of internal/engine/engine_test.go: same inputs, same expected values.

describe('addMonthClamped (TestAddMonthClamped)', () => {
  it.each<[string, Date, number, Date]>([
    ['jan31+1=feb28_nonleap', date(2025, 1, 31), 1, date(2025, 2, 28)],
    ['jan31+1=feb29_leap', date(2024, 1, 31), 1, date(2024, 2, 29)],
    ['feb29+12=feb28', date(2024, 2, 29), 12, date(2025, 2, 28)],
    ['mar31+1=apr30', date(2025, 3, 31), 1, date(2025, 4, 30)],
    ['dec31+1=jan31', date(2025, 12, 31), 1, date(2026, 1, 31)],
    ['jan15+1=feb15_noclamp', date(2025, 1, 15), 1, date(2025, 2, 15)],
    ['jan31-1=dec31', date(2025, 1, 31), -1, date(2024, 12, 31)],
    ['aug31+1=sep30', date(2025, 8, 31), 1, date(2025, 9, 30)],
    ['jan31+2=mar31_noclamp', date(2025, 1, 31), 2, date(2025, 3, 31)],
  ])('%s', (_name, input, n, expected) => {
    const got = addMonthClamped(input, n)
    expect(got.getTime()).toBe(expected.getTime())
  })
})

describe('nextPayday bi-weekly (TestNextPayday_BiWeekly)', () => {
  const sched: PaySchedule = { frequency: FREQ_BI_WEEKLY, anchorDate: date(2025, 1, 3) } // A Friday

  it.each<[string, Date, Date]>([
    ['from_before_first_period', date(2025, 1, 1), date(2025, 1, 3)],
    ['from_on_anchor', date(2025, 1, 3), date(2025, 1, 17)],
    ['from_midway', date(2025, 1, 10), date(2025, 1, 17)],
    ['from_on_second', date(2025, 1, 17), date(2025, 1, 31)],
    ['from_after_several', date(2025, 2, 14), date(2025, 2, 28)],
  ])('%s', (_name, from, expected) => {
    expect(nextPayday(sched, from).getTime()).toBe(expected.getTime())
  })
})

describe('nextPayday weekly (TestNextPayday_Weekly)', () => {
  const sched: PaySchedule = { frequency: FREQ_WEEKLY, anchorDate: date(2025, 1, 6) } // Monday

  it.each<[string, Date, Date]>([
    ['from_before_anchor', date(2025, 1, 1), date(2025, 1, 6)],
    ['from_on_anchor', date(2025, 1, 6), date(2025, 1, 13)],
    ['from_midweek', date(2025, 1, 9), date(2025, 1, 13)],
  ])('%s', (_name, from, expected) => {
    expect(nextPayday(sched, from).getTime()).toBe(expected.getTime())
  })
})

describe('nextPayday monthly (TestNextPayday_Monthly)', () => {
  const sched: PaySchedule = { frequency: FREQ_MONTHLY, anchorDate: date(2025, 1, 31) }

  it.each<[string, Date, Date]>([
    ['from_jan_31', date(2025, 1, 31), date(2025, 2, 28)],
    ['from_jan_15', date(2025, 1, 15), date(2025, 1, 31)],
    ['from_feb_28', date(2025, 2, 28), date(2025, 3, 31)],
  ])('%s', (_name, from, expected) => {
    expect(nextPayday(sched, from).getTime()).toBe(expected.getTime())
  })
})

describe('nextPayday semi-monthly (TestNextPayday_SemiMonthly)', () => {
  const sched: PaySchedule = {
    frequency: FREQ_SEMI_MONTHLY,
    anchorDate: date(2025, 1, 15),
    dayOfMonth2: 30,
  }

  it.each<[string, Date, Date]>([
    ['from_jan_1', date(2025, 1, 1), date(2025, 1, 15)],
    ['from_jan_15', date(2025, 1, 15), date(2025, 1, 30)],
    ['from_jan_20', date(2025, 1, 20), date(2025, 1, 30)],
    // Sat 15th moves to Fri (AdjustToBusinessDay).
    ['from_jan_30', date(2025, 1, 30), date(2025, 2, 14)],
    // Feb has no day 30, so it clamps to Feb 28.
    ['from_feb_15', date(2025, 2, 15), date(2025, 2, 28)],
  ])('%s', (_name, from, expected) => {
    expect(nextPayday(sched, from).getTime()).toBe(expected.getTime())
  })
})
