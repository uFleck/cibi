// Port of internal/service/accounts.go.
//
// Ids are canonical UUID strings. Pointer parameters of the Go code (nil = no change) are
// `undefined` here.

import { DEFAULT_SAFETY_BUFFER_CENTS } from '../config'
import { wrapping } from '../errors'
import type { Account, AccountsRepo, NewAccount } from '../repo/accounts'
import type { LedgerService } from './ledger'

export class AccountsService {
  private readonly accRepo: AccountsRepo
  private readonly ledgerSvc: LedgerService

  constructor(accRepo: AccountsRepo, ledgerSvc: LedgerService) {
    this.accRepo = accRepo
    this.ledgerSvc = ledgerSvc
  }

  listAccounts(): Promise<Account[]> {
    return wrapping('service.ListAccounts', () => this.accRepo.getAll())
  }

  /**
   * Inserts a new account. A safety buffer of 0 becomes DEFAULT_SAFETY_BUFFER_CENTS in the
   * stored row. The caller's object is not changed (Go passes the struct by value).
   */
  async createAccount(a: NewAccount): Promise<void> {
    const row: NewAccount = a.safetyBuffer === 0 ? { ...a, safetyBuffer: DEFAULT_SAFETY_BUFFER_CENTS } : a
    await wrapping('service.CreateAccount', () => this.accRepo.insert(row))
  }

  deleteAccount(id: string): Promise<void> {
    return wrapping('service.DeleteAccount', () => this.accRepo.deleteById(id))
  }

  /** Rejects with an error wrapping ErrNoRows when the account does not exist. */
  getById(id: string): Promise<Account> {
    return wrapping('service.GetByID', () => this.accRepo.getById(id))
  }

  /**
   * Patches mutable fields. name and balance are applied in that order, not atomically
   * (as in Go): a balance change is recorded as a manual_adjustment ledger entry.
   * An empty name is accepted as is.
   */
  async updateAccount(id: string, name?: string, balance?: number, safetyBuffer?: number): Promise<void> {
    if (name !== undefined) {
      await wrapping('service.UpdateAccount: name', () => this.accRepo.updateName(id, name))
    }
    if (balance !== undefined) {
      const acc = await wrapping('service.UpdateAccount: get account', () => this.accRepo.getById(id))
      const delta = balance - acc.currentBalance
      if (delta !== 0) {
        await wrapping('service.UpdateAccount: record adjustment', () =>
          this.ledgerSvc.recordEntry({
            accountId: id,
            transactionId: null,
            payScheduleId: null,
            entryType: 'manual_adjustment',
            amount: delta,
            description: 'Manual balance adjustment',
            postedAt: new Date(),
          }),
        )
      }
    }
    if (safetyBuffer !== undefined) {
      await wrapping('service.UpdateAccount: safety_buffer', () =>
        this.accRepo.updateSafetyBuffer(id, safetyBuffer),
      )
    }
  }
}
