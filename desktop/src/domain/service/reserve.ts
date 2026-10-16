// The reserve: a pot that fills on each payday and that the "Can I Buy It?" check never spends.
//
// It is virtual: the money stays in the account, and the engine subtracts the reserve balance from
// what you can spend. A contribution is posted when a payday is confirmed (see PayScheduleService),
// once per payday of a pay schedule. Settings live in AppSetting under `reserve.<account id>`.

import type { Db } from '../db'
import { AppError, wrapping } from '../errors'
import { addDays, formatYmd } from '../dates'
import { nextPayday } from '../engine/engine'
import {
  assertValidReserveConfig,
  contributionFor,
  monthlyEquivalent,
  parseReserveConfig,
  reserveTarget,
  serializeReserveConfig,
  type ReserveConfig,
} from '../reserve'
import type { AppSettingRepo } from '../repo/appSetting'
import type { PaySchedule, PayScheduleRepo } from '../repo/paySchedule'
import type { ReserveEntry, ReserveRepo } from '../repo/reserve'
import type { TransactionsRepo } from '../repo/transactions'
import type { EstimateService } from './estimate'

/** What the user edits; the start time is kept by the service. */
export interface ReserveConfigInput {
  enabled: boolean
  targetMonths: number
  startCents: number
  stepCents: number
  capPercent: number
}

export interface NextContribution {
  /** Cents. */
  amount: number
  payday: Date
  label: string | null
}

export interface ReserveState {
  config: ReserveConfig
  /** Cents. */
  balance: number
  /** Cents: the target months of obligations. */
  target: number
  /** Cents a month of recurring expenses and running installments cost. */
  monthlyObligations: number
  /** How many months of obligations the balance covers; null when there are no obligations. */
  monthsCovered: number | null
  /** 0 to 1. */
  progress: number
  nextContribution: NextContribution | null
  /** The payday on which the target is reached at the current pace; null when it never is. */
  eta: Date | null
  pendingTransfers: ReserveEntry[]
  entries: ReserveEntry[]
}

const RECENT_ENTRIES = 20
const ETA_HORIZON_DAYS = 20 * 366
const ETA_MAX_PAYDAYS = 2000
const PAYDAY_STEP_DAYS = 3

function settingKey(accountId: string): string {
  return `reserve.${accountId}`
}

export class ReserveService {
  private readonly db: Db
  private readonly repo: ReserveRepo
  private readonly settings: AppSettingRepo
  private readonly txnsRepo: Pick<TransactionsRepo, 'getByAccount'>
  private readonly psRepo: Pick<PayScheduleRepo, 'listByAccountId'>
  private readonly estimator: Pick<EstimateService, 'effectiveAmount'>

  constructor(
    db: Db,
    repo: ReserveRepo,
    settings: AppSettingRepo,
    txnsRepo: Pick<TransactionsRepo, 'getByAccount'>,
    psRepo: Pick<PayScheduleRepo, 'listByAccountId'>,
    estimator: Pick<EstimateService, 'effectiveAmount'>,
  ) {
    this.db = db
    this.repo = repo
    this.settings = settings
    this.txnsRepo = txnsRepo
    this.psRepo = psRepo
    this.estimator = estimator
  }

  async getConfig(accountId: string): Promise<ReserveConfig> {
    const raw = await wrapping('service.Reserve.GetConfig', () => this.settings.get(settingKey(accountId)))
    return parseReserveConfig(raw === null ? null : JSON.parse(raw))
  }

  async saveConfig(accountId: string, input: ReserveConfigInput, now: Date = new Date()): Promise<ReserveConfig> {
    assertValidReserveConfig(input)
    const previous = await this.getConfig(accountId)
    const config: ReserveConfig = {
      ...input,
      // The step-up counts from the first time the reserve was switched on, and keeps counting if it is paused.
      startedAt: previous.startedAt ?? (input.enabled ? now : null),
    }
    await wrapping('service.Reserve.SaveConfig', () =>
      this.settings.upsert(settingKey(accountId), JSON.stringify(serializeReserveConfig(config))),
    )
    return config
  }

  /** What you cannot spend: the reserve balance when it is on, else the account's own safety buffer. */
  async bufferFor(accountId: string, legacyBufferCents: number): Promise<number> {
    const config = await this.getConfig(accountId)
    if (!config.enabled) return legacyBufferCents
    return Math.max(0, await wrapping('service.Reserve.BufferFor', () => this.repo.balance(accountId)))
  }

  /** Cents a month of recurring expenses and running installments cost (estimates included). */
  async monthlyObligations(accountId: string): Promise<number> {
    const txns = await wrapping('service.Reserve.MonthlyObligations', () => this.txnsRepo.getByAccount(accountId))
    let total = 0
    for (const t of txns) {
      if (t.type === 'peer' || t.amount >= 0) continue
      if (t.isRecurring) {
        total += monthlyEquivalent(-(await this.estimator.effectiveAmount(t)), t.frequency)
      } else if (t.isInstallment && t.totalInstallments !== null && t.paidInstallments < t.totalInstallments) {
        total += monthlyEquivalent(-t.amount, t.frequency)
      }
    }
    return Math.round(total)
  }

  /**
   * Sets money aside for a payday that was just confirmed. Does nothing when the reserve is off, when
   * the amount works out to zero, or when this payday already has its contribution.
   */
  async contributeForPayday(ps: PaySchedule, now: Date = new Date()): Promise<ReserveEntry | null> {
    const config = await this.getConfig(ps.accountId)
    if (!config.enabled) return null
    const payday = formatYmd(ps.anchorDate)
    if (await this.repo.hasContribution(ps.id, payday)) return null

    const balance = await this.repo.balance(ps.accountId)
    const target = reserveTarget(config.targetMonths, await this.monthlyObligations(ps.accountId))
    const amount = contributionFor({
      config,
      scheduleAmountCents: ps.amount,
      payday: ps.anchorDate,
      balanceCents: balance,
      targetCents: target,
    })
    if (amount <= 0) return null

    const entry: ReserveEntry = {
      id: crypto.randomUUID(),
      accountId: ps.accountId,
      amount,
      kind: 'contribution',
      payScheduleId: ps.id,
      payday,
      note: null,
      postedAt: now,
      movedAt: null,
    }
    await wrapping('service.Reserve.Contribute', () => this.repo.insert(entry))
    return entry
  }

  /** Takes money out of the reserve. A reason is required, so each withdrawal leaves a trace. */
  async withdraw(accountId: string, cents: number, note: string, now: Date = new Date()): Promise<ReserveEntry> {
    const reason = note.trim()
    if (reason === '') throw new AppError('say why you are using the reserve')
    if (!Number.isInteger(cents) || cents <= 0) throw new AppError('withdrawal must be more than 0')
    return this.db.tx(async () => {
      const balance = await this.repo.balance(accountId)
      if (cents > balance) throw new AppError('the reserve does not hold that much')
      const entry: ReserveEntry = {
        id: crypto.randomUUID(),
        accountId,
        amount: -cents,
        kind: 'withdrawal',
        payScheduleId: null,
        payday: null,
        note: reason,
        postedAt: now,
        movedAt: null,
      }
      await wrapping('service.Reserve.Withdraw', () => this.repo.insert(entry))
      return entry
    })
  }

  /** Records that a contribution was also moved to a real place (an investment, a savings account). */
  markMoved(id: string, now: Date = new Date()): Promise<void> {
    return wrapping('service.Reserve.MarkMoved', () => this.repo.markMoved(id, now))
  }

  async state(accountId: string, now: Date = new Date()): Promise<ReserveState> {
    const config = await this.getConfig(accountId)
    const balance = await this.repo.balance(accountId)
    const monthlyObligations = await this.monthlyObligations(accountId)
    const target = reserveTarget(config.targetMonths, monthlyObligations)
    const schedules = await wrapping('service.Reserve.State: pay schedules', () => this.psRepo.listByAccountId(accountId))

    return {
      config,
      balance,
      target,
      monthlyObligations,
      monthsCovered: monthlyObligations > 0 ? balance / monthlyObligations : null,
      progress: target > 0 ? Math.min(1, Math.max(0, balance / target)) : 0,
      nextContribution: config.enabled ? this.nextContribution(config, schedules, balance, target, now) : null,
      eta: config.enabled ? this.eta(config, schedules, balance, target, now) : null,
      pendingTransfers: await this.repo.listPendingTransfers(accountId),
      entries: await this.repo.list(accountId, RECENT_ENTRIES),
    }
  }

  private nextContribution(
    config: ReserveConfig,
    schedules: PaySchedule[],
    balance: number,
    target: number,
    now: Date,
  ): NextContribution | null {
    let best: { ps: PaySchedule; payday: Date } | null = null
    for (const ps of schedules) {
      const payday = nextPayday({ frequency: ps.frequency, anchorDate: ps.anchorDate, dayOfMonth2: ps.dayOfMonth2 }, now)
      if (best === null || payday.getTime() < best.payday.getTime()) best = { ps, payday }
    }
    if (best === null) return null
    const amount = contributionFor({
      config,
      scheduleAmountCents: best.ps.amount,
      payday: best.payday,
      balanceCents: balance,
      targetCents: target,
    })
    return { amount, payday: best.payday, label: best.ps.label }
  }

  /** Replays the coming paydays, all schedules merged by date, until the balance reaches the target. */
  private eta(config: ReserveConfig, schedules: PaySchedule[], balance: number, target: number, now: Date): Date | null {
    if (target <= 0 || balance >= target || schedules.length === 0) return null
    const horizon = addDays(now, ETA_HORIZON_DAYS).getTime()
    const upcoming = schedules.map((ps) => ({
      ps,
      schedule: { frequency: ps.frequency, anchorDate: ps.anchorDate, dayOfMonth2: ps.dayOfMonth2 },
      next: nextPayday({ frequency: ps.frequency, anchorDate: ps.anchorDate, dayOfMonth2: ps.dayOfMonth2 }, now),
    }))
    let simulated = balance
    for (let i = 0; i < ETA_MAX_PAYDAYS; i++) {
      let soonest = upcoming[0]
      if (soonest === undefined) return null
      for (const u of upcoming) if (u.next.getTime() < soonest.next.getTime()) soonest = u
      if (soonest.next.getTime() > horizon) return null
      simulated += contributionFor({
        config,
        scheduleAmountCents: soonest.ps.amount,
        payday: soonest.next,
        balanceCents: simulated,
        targetCents: target,
      })
      if (simulated >= target) return soonest.next
      // nextPayday returns the same date again when a payday was moved back to a business day (12-05 -> 12-04),
      // so step from a few days later, which is still before the following payday of any frequency.
      soonest.next = nextPayday(soonest.schedule, addDays(soonest.next, PAYDAY_STEP_DAYS))
    }
    return null
  }
}
