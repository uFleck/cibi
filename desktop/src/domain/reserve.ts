// The reserve (the new safety buffer): its settings and the arithmetic behind its target and its
// payday contributions.
//
// Money: integer cents. Dates: UTC.

import { addMonthClamped } from './engine/engine'
import { AppError } from './errors'

export interface ReserveConfig {
  enabled: boolean
  /** How many months of obligations the reserve should hold. */
  targetMonths: number
  /** Cents set aside on the first payday after it is switched on. */
  startCents: number
  /** Cents added to the contribution for every month since it was switched on. */
  stepCents: number
  /** A contribution never exceeds this percent of the pay schedule's amount. */
  capPercent: number
  /** UTC instant the reserve was first switched on; null until then. */
  startedAt: Date | null
}

export const DEFAULT_RESERVE_CONFIG: ReserveConfig = {
  enabled: false,
  targetMonths: 1,
  startCents: 0,
  stepCents: 0,
  capPercent: 5,
  startedAt: null,
}

export const MAX_TARGET_MONTHS = 60

/** The problem with a config, or null when it is valid. */
export function validateReserveConfig(c: Pick<ReserveConfig, 'targetMonths' | 'startCents' | 'stepCents' | 'capPercent'>): string | null {
  if (!Number.isFinite(c.targetMonths) || c.targetMonths <= 0 || c.targetMonths > MAX_TARGET_MONTHS) {
    return `target months must be more than 0 and at most ${MAX_TARGET_MONTHS}`
  }
  if (!Number.isInteger(c.startCents) || c.startCents < 0) return 'start amount must be 0 or more'
  if (!Number.isInteger(c.stepCents) || c.stepCents < 0) return 'monthly step-up must be 0 or more'
  if (!Number.isFinite(c.capPercent) || c.capPercent < 0 || c.capPercent > 100) return 'cap must be between 0 and 100 percent'
  return null
}

export function assertValidReserveConfig(c: Parameters<typeof validateReserveConfig>[0]): void {
  const problem = validateReserveConfig(c)
  if (problem !== null) throw new AppError(problem)
}

/** What a payment of `cents` every `frequency` costs per month. Unknown frequencies count as monthly. */
export function monthlyEquivalent(cents: number, frequency: string | null): number {
  switch (frequency) {
    case 'weekly':
      return (cents * 52) / 12
    case 'bi-weekly':
    case 'biweekly':
      return (cents * 26) / 12
    case 'yearly':
      return cents / 12
    default:
      return cents
  }
}

/** The reserve target: `months` months of obligations, in cents. */
export function reserveTarget(months: number, monthlyObligationsCents: number): number {
  return Math.round(months * monthlyObligationsCents)
}

/** Whole calendar months from `from` to `to`, never negative. */
export function monthsBetween(from: Date, to: Date): number {
  let months = 0
  while (months < 1200 && addMonthClamped(from, months + 1).getTime() <= to.getTime()) months++
  return months
}

export interface ContributionInput {
  config: ReserveConfig
  /** The pay schedule's amount for one payday, cents. */
  scheduleAmountCents: number
  payday: Date
  /** What the reserve holds now, cents. */
  balanceCents: number
  targetCents: number
}

/**
 * What to set aside on a payday: the start amount plus a step for each month since the reserve was
 * switched on, held to the percentage cap of the paycheck and to what is still missing from the target.
 */
export function contributionFor(input: ContributionInput): number {
  const { config, scheduleAmountCents, payday, balanceCents, targetCents } = input
  if (!config.enabled || config.startedAt === null) return 0
  const months = monthsBetween(config.startedAt, payday)
  const wanted = config.startCents + config.stepCents * months
  const cap = Math.floor((Math.max(0, scheduleAmountCents) * config.capPercent) / 100)
  const missing = Math.max(0, targetCents - balanceCents)
  return Math.max(0, Math.min(wanted, cap, missing))
}

/** Reads a stored config; anything missing or malformed falls back to the defaults. */
export function parseReserveConfig(raw: unknown): ReserveConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_RESERVE_CONFIG }
  const r = raw as Record<string, unknown>
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const startedAt = typeof r.startedAt === 'string' ? new Date(r.startedAt) : null
  return {
    enabled: r.enabled === true,
    targetMonths: num(r.targetMonths, DEFAULT_RESERVE_CONFIG.targetMonths),
    startCents: num(r.startCents, DEFAULT_RESERVE_CONFIG.startCents),
    stepCents: num(r.stepCents, DEFAULT_RESERVE_CONFIG.stepCents),
    capPercent: num(r.capPercent, DEFAULT_RESERVE_CONFIG.capPercent),
    startedAt: startedAt !== null && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
  }
}

export function serializeReserveConfig(c: ReserveConfig): Record<string, unknown> {
  return {
    enabled: c.enabled,
    targetMonths: c.targetMonths,
    startCents: c.startCents,
    stepCents: c.stepCents,
    capPercent: c.capPercent,
    startedAt: c.startedAt === null ? null : c.startedAt.toISOString(),
  }
}
