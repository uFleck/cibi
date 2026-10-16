// Port of internal/service/pay_schedule.go.
//
// Ids are canonical UUID strings. Go's `*int` and `*string` parameters are `number | null` and
// `string | null`. Go's ConfirmPayday Begin/Commit is db.tx().

import type { Db } from '../db'
import { wrap, wrapping } from '../errors'
import { nextPayday } from '../engine/engine'
import type { AccountsRepo } from '../repo/accounts'
import type { PaySchedule, PayScheduleRepo } from '../repo/paySchedule'
import type { LedgerService } from './ledger'
import type { ReserveService } from './reserve'

export class PayScheduleService {
  private readonly db: Db
  private readonly psRepo: PayScheduleRepo
  private readonly accRepo: AccountsRepo
  private readonly ledgerSvc: LedgerService
  private readonly reserve: Pick<ReserveService, 'contributeForPayday'>

  constructor(
    db: Db,
    psRepo: PayScheduleRepo,
    accRepo: AccountsRepo,
    ledgerSvc: LedgerService,
    reserve: Pick<ReserveService, 'contributeForPayday'> = { contributeForPayday: async () => null },
  ) {
    this.db = db
    this.psRepo = psRepo
    this.accRepo = accRepo
    this.ledgerSvc = ledgerSvc
    this.reserve = reserve
  }

  /** Checks that the account exists, then inserts the schedule with a new id. */
  async createPaySchedule(
    accountId: string,
    frequency: string,
    anchorDate: Date,
    dayOfMonth2: number | null,
    label: string | null,
    amount: number,
  ): Promise<PaySchedule> {
    try {
      await this.accRepo.getById(accountId)
    } catch (err) {
      throw wrap('service.CreatePaySchedule: account not found', err)
    }

    const ps: PaySchedule = {
      id: crypto.randomUUID(),
      accountId,
      frequency,
      anchorDate,
      dayOfMonth2,
      label,
      amount,
    }
    await wrapping('service.CreatePaySchedule: insert', () => this.psRepo.insert(ps))
    return ps
  }

  listPaySchedules(accountId: string): Promise<PaySchedule[]> {
    return wrapping('service.ListPaySchedules', () => this.psRepo.listByAccountId(accountId))
  }

  /** Updates the schedule with the given id. Rejects with an error wrapping ErrNoRows when the id is unknown. */
  async updatePaySchedule(
    id: string,
    frequency: string,
    anchorDate: Date,
    dayOfMonth2: number | null,
    label: string | null,
    amount: number,
  ): Promise<void> {
    await wrapping('service.UpdatePaySchedule', () =>
      this.psRepo.updateById(id, { frequency, anchorDate, dayOfMonth2, label, amount }),
    )
  }

  /** Deletes the schedule with the given id. Rejects with an error wrapping ErrNoRows when the id is unknown. */
  deletePaySchedule(id: string): Promise<void> {
    return wrapping('service.DeletePaySchedule', () => this.psRepo.deleteById(id))
  }

  /**
   * Credits the schedule amount to its account (an income ledger entry) and advances the
   * anchor past the next occurrence, in one transaction. Rejects with an error wrapping
   * ErrNoRows when the schedule does not exist.
   */
  async confirmPayday(id: string): Promise<PaySchedule> {
    const ps = await wrapping('service.ConfirmPayday: get schedule', () => this.psRepo.getById(id))
    const acc = await wrapping('service.ConfirmPayday: get account', () => this.accRepo.getById(ps.accountId))

    const schedule = { frequency: ps.frequency, anchorDate: ps.anchorDate, dayOfMonth2: ps.dayOfMonth2 }
    const upcoming = nextPayday(schedule, new Date())
    const nextAfterUpcoming = nextPayday(schedule, upcoming)

    await this.db.tx(async () => {
      // Go: a nil label falls back to the id; an empty label is used as it is.
      const description = ps.label !== null ? ps.label : ps.id
      await wrapping('service.ConfirmPayday: record income', () =>
        this.ledgerSvc.recordEntry(
          {
            accountId: acc.id,
            transactionId: null,
            payScheduleId: ps.id,
            entryType: 'income',
            amount: ps.amount,
            description,
            postedAt: new Date(),
          },
          true,
        ),
      )
      // The reserve is funded from the payday being confirmed, so it uses the schedule as it was before the anchor moves.
      await wrapping('service.ConfirmPayday: fund reserve', () => this.reserve.contributeForPayday(ps))
      await wrapping('service.ConfirmPayday: update anchor', () =>
        this.psRepo.updateAnchorDate(ps.id, nextAfterUpcoming),
      )
    })

    return { ...ps, anchorDate: nextAfterUpcoming }
  }
}
