// Port of internal/service/ledger.go.
//
// Go's outerTx parameter becomes alreadyInTx: when true, the caller already holds the
// transaction (db.tx) and the work runs inside it. A nested db.tx() would throw.

import type { Db } from '../db'
import { AppError, ErrNoRows, wrap, wrapping } from '../errors'
import type { AccountsRepo } from '../repo/accounts'
import type { LedgerEntry, LedgerRepo, NewLedgerEntry } from '../repo/ledger'

export class LedgerService {
  private readonly db: Db
  private readonly ledgerRepo: LedgerRepo
  private readonly accRepo: AccountsRepo

  constructor(db: Db, ledgerRepo: LedgerRepo, accRepo: AccountsRepo) {
    this.db = db
    this.ledgerRepo = ledgerRepo
    this.accRepo = accRepo
  }

  /**
   * Inserts a ledger row, then sets the account balance to the SUM of all its entries.
   * Opens its own transaction unless alreadyInTx is true.
   */
  async recordEntry(entry: NewLedgerEntry, alreadyInTx = false): Promise<void> {
    if (alreadyInTx) {
      await this.applyEntry(entry)
      return
    }
    try {
      await this.db.tx(() => this.applyEntry(entry))
    } catch (err) {
      throw wrap('service.LedgerService.RecordEntry', err)
    }
  }

  private async applyEntry(entry: NewLedgerEntry): Promise<void> {
    await wrapping('insert ledger', () => this.ledgerRepo.insert(entry))
    const newBalance = await wrapping('sum ledger', () => this.ledgerRepo.sumByAccount(entry.accountId))
    await wrapping('update balance', () => this.accRepo.updateBalance(entry.accountId, newBalance))
  }

  /** Removes a ledger entry by id and recomputes the account balance. Rejects with an error wrapping ErrNoRows when the entry does not exist. */
  async delete(id: string): Promise<void> {
    const entry = await wrapping('service.LedgerService.Delete: find', () => this.ledgerRepo.findById(id))
    if (entry === null) throw wrap('service.LedgerService.Delete', ErrNoRows)
    const accountId = entry.accountId
    await this.db.tx(async () => {
      await wrapping('service.LedgerService.Delete: delete', () => this.ledgerRepo.deleteById(id))
      const newBalance = await wrapping('service.LedgerService.Delete: sum', () =>
        this.ledgerRepo.sumByAccount(accountId),
      )
      await wrapping('service.LedgerService.Delete: update balance', () =>
        this.accRepo.updateBalance(accountId, newBalance),
      )
    })
  }

  /** Deletes the ledger entry of a transaction. A no-op when there is none. */
  async deleteByTransactionId(txnId: string): Promise<void> {
    const entry = await wrapping('service.LedgerService.DeleteByTransactionID: find', () =>
      this.ledgerRepo.findByTransactionId(txnId),
    )
    if (entry === null) return
    await this.delete(entry.id)
  }

  /** Keeps the entries of a transaction as history but unlinks them, so the transaction can be deleted. The balance does not change. */
  detachFromTransaction(txnId: string): Promise<void> {
    return wrapping('service.LedgerService.DetachFromTransaction', () => this.ledgerRepo.detachFromTransaction(txnId))
  }

  findByTransactionId(id: string): Promise<LedgerEntry | null> {
    return this.ledgerRepo.findByTransactionId(id)
  }

  /** All ledger entries of an account, newest first (SQL order by posted_at). */
  list(accountId: string): Promise<LedgerEntry[]> {
    return this.ledgerRepo.listByAccount(accountId)
  }

  recordIncome(accountId: string, payScheduleId: string, amount: number, description: string): Promise<void> {
    return this.recordEntry({
      accountId,
      transactionId: null,
      payScheduleId,
      entryType: 'income',
      amount,
      description,
      postedAt: new Date(),
    })
  }

  /** Sets the account balance to the sum of its ledger entries. */
  async recomputeBalance(accountId: string): Promise<void> {
    await this.db.tx(async () => {
      const newBalance = await wrapping('service.LedgerService.RecomputeBalance: sum', () =>
        this.ledgerRepo.sumByAccount(accountId),
      )
      await wrapping('service.LedgerService.RecomputeBalance: update balance', () =>
        this.accRepo.updateBalance(accountId, newBalance),
      )
    })
  }

  /** Sets an entry's amount and recomputes the account balance in one transaction. */
  async updateEntryAmount(id: string, amount: number): Promise<void> {
    const entry = await wrapping('service.LedgerService.UpdateEntryAmount: find', () =>
      this.ledgerRepo.findById(id),
    )
    if (entry === null) {
      throw new AppError(`service.LedgerService.UpdateEntryAmount: entry ${id} not found`)
    }
    const accountId = entry.accountId
    await this.db.tx(async () => {
      await wrapping('service.LedgerService.UpdateEntryAmount: update amount', () =>
        this.ledgerRepo.updateAmount(id, amount),
      )
      const newBalance = await wrapping('service.LedgerService.UpdateEntryAmount: sum', () =>
        this.ledgerRepo.sumByAccount(accountId),
      )
      await wrapping('service.LedgerService.UpdateEntryAmount: update balance', () =>
        this.accRepo.updateBalance(accountId, newBalance),
      )
    })
  }
}
