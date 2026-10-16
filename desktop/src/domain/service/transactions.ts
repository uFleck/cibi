// Port of internal/service/transactions.go.
//
// Ids are canonical UUID strings. Go's zero time.Time of a new transaction is `undefined` here
// (NewTransaction.timestamp), and Go's zero time returned by ConfirmRecurring is `null`.
// Go's Begin/Commit blocks are db.tx(). Go passes its *sql.Tx to the repo and ledger calls inside a
// block; here those calls simply run inside db.tx(). Go looks up the ledger entry before opening a
// tx (MaxOpenConns=1), and that order is kept.
// Go's value parameter (the caller's struct is copied) is a copy here too: the input is not changed.

import type { Db } from '../db'
import { AppError, wrapping } from '../errors'
import { addDays } from '../dates'
import { addMonthClamped, FREQ_BI_WEEKLY, FREQ_MONTHLY, FREQ_WEEKLY, FREQ_YEARLY } from '../engine/engine'
import { categoryOptions, normalizeCategory } from '../categories'
import { classificationText, suggestCategory } from '../classifier'
import type { AccountsRepo } from '../repo/accounts'
import { VALID_FREQUENCIES, type Transaction, type TransactionsRepo, type UpdateTransaction } from '../repo/transactions'
import type { LedgerService } from './ledger'

/** deleteTransaction on a transaction that has a ledger row. The handler maps it to 409. */
export const ErrTransactionHasLedger = new AppError('transaction has ledger entries and cannot be deleted')

/**
 * A transaction to create: id and timestamp are filled in when they are undefined (Go: uuid.Nil, zero time).
 * A blank category is filled in by the classifier when the transaction is an expense.
 */
export type NewTransaction = Omit<Transaction, 'id' | 'timestamp' | 'category'> & {
  id?: string
  timestamp?: Date
  category?: string | null
}

export class TransactionsService {
  private readonly db: Db
  private readonly txnsRepo: TransactionsRepo
  private readonly ledgerSvc: LedgerService

  // Go keeps accRepo in the struct, but no transactions method uses it, so the port does not store it.
  constructor(db: Db, txnsRepo: TransactionsRepo, _accRepo: AccountsRepo, ledgerSvc: LedgerService) {
    this.db = db
    this.txnsRepo = txnsRepo
    this.ledgerSvc = ledgerSvc
  }

  /**
   * Validates and inserts a new transaction. anchor_date is required when is_recurring is true,
   * and frequency must be a valid one then. D-01: the insert and the balance update (when the
   * transaction should impact the balance now) happen in one transaction. Returns the stored row.
   */
  async createTransaction(input: NewTransaction): Promise<Transaction> {
    const t: Transaction = {
      ...input,
      id: input.id || crypto.randomUUID(),
      timestamp: input.timestamp ?? new Date(),
      category: normalizeCategory(input.category),
    }

    if (t.isRecurring) {
      if (t.frequency === null || !VALID_FREQUENCIES.has(t.frequency)) {
        throw new AppError('recurring transaction requires a valid frequency (weekly, bi-weekly, monthly, yearly)')
      }
      if (t.anchorDate === null) {
        throw new AppError('recurring transaction requires anchor_date')
      }
      // Set initial next_occurrence = anchor_date if not provided.
      if (t.nextOccurrence === null) {
        t.nextOccurrence = new Date(t.anchorDate.getTime())
      }
    }

    if (t.isInstallment) {
      if (t.isRecurring) {
        throw new AppError('is_installment and is_recurring are mutually exclusive')
      }
      if (t.totalInstallments === null || t.totalInstallments <= 0) {
        throw new AppError('installment transaction requires total_installments > 0')
      }
      if (t.anchorDate === null) {
        throw new AppError('installment transaction requires anchor_date')
      }
      if (t.frequency === null || (t.frequency !== FREQ_MONTHLY && t.frequency !== FREQ_WEEKLY)) {
        throw new AppError('installment transaction requires frequency of monthly or weekly')
      }
    }

    if (t.category === null && t.amount < 0) {
      t.category = await this.autoCategory(t.title, t.description)
    }

    const applyToBalance = shouldApplyBalanceOnCreate(t, new Date())

    await this.db.tx(async () => {
      await wrapping('service.CreateTransaction: insert', () => this.txnsRepo.insert(t))
      if (applyToBalance) {
        await wrapping('service.CreateTransaction: record ledger', () =>
          this.ledgerSvc.recordEntry(
            {
              accountId: t.accountId,
              transactionId: t.id,
              payScheduleId: null,
              entryType: 'payment',
              amount: t.amount,
              description: t.title,
              postedAt: t.timestamp,
            },
            true,
          ),
        )
      }
    })
    return t
  }

  /**
   * The classifier's category for a title and description. Only a model that is already loaded is
   * asked, so a save never waits for it. A failure is no category: it never fails the save.
   */
  private async autoCategory(title: string, description: string | null): Promise<string | null> {
    try {
      const options = categoryOptions(await this.txnsRepo.distinctCategories())
      return (await suggestCategory(classificationText(title, description), options, { onlyIfReady: true }))?.category ?? null
    } catch {
      return null
    }
  }

  /** All transactions of an account (every type, as Go's GetByAccount). */
  listTransactions(accountId: string): Promise<Transaction[]> {
    return wrapping('service.ListTransactions', () => this.txnsRepo.getByAccount(accountId))
  }

  /** Rejects with an error wrapping ErrNoRows when the transaction does not exist. */
  getTransaction(id: string): Promise<Transaction> {
    return wrapping('service.GetTransaction', () => this.txnsRepo.getById(id))
  }

  /**
   * Patches the mutable fields of a transaction. D-02: when the amount changes, the account
   * balance is recalculated, but only when this transaction has already impacted it.
   */
  async updateTransaction(id: string, upd: UpdateTransaction): Promise<void> {
    const setInstallment = upd.isInstallment === true
    const setRecurring = upd.isRecurring === true
    if (setInstallment && setRecurring) {
      throw new AppError('is_installment and is_recurring are mutually exclusive')
    }
    if (setInstallment) {
      const oldTxn = await wrapping('service.UpdateTransaction: get old transaction', () =>
        this.txnsRepo.getById(id),
      )
      if (!oldTxn.isInstallment) {
        if (upd.totalInstallments === undefined || upd.totalInstallments <= 0) {
          throw new AppError('installment transaction requires total_installments > 0')
        }
        if (upd.anchorDate === undefined) {
          throw new AppError('installment transaction requires anchor_date')
        }
        if (upd.frequency === undefined || (upd.frequency !== FREQ_MONTHLY && upd.frequency !== FREQ_WEEKLY)) {
          throw new AppError('installment transaction requires frequency of monthly or weekly')
        }
      }
    }

    if (upd.totalInstallments !== undefined) {
      const oldTxn = await wrapping('service.UpdateTransaction: get old transaction', () =>
        this.txnsRepo.getById(id),
      )
      if (upd.totalInstallments < oldTxn.paidInstallments) {
        throw new AppError(
          `total_installments (${upd.totalInstallments}) cannot be less than paid_installments (${oldTxn.paidInstallments})`,
        )
      }
    }

    // D-02: If amount is being changed, recalculate balance atomically when
    // this transaction has already impacted account balance.
    const amount = upd.amount
    if (amount !== undefined) {
      const oldTxn = await wrapping('service.UpdateTransaction: get old transaction', () =>
        this.txnsRepo.getById(id),
      )

      if (!hasAppliedToBalance(oldTxn, new Date())) {
        await wrapping('service.UpdateTransaction', () => this.txnsRepo.update(id, upd))
        return
      }

      // Go ignores the lookup error here: a failed lookup is the same as no ledger entry.
      // Looked up before the tx (MaxOpenConns=1 in Go).
      const ledgerEntry = await this.ledgerSvc.findByTransactionId(id).catch(() => null)

      await wrapping('service.UpdateTransaction: update', () =>
        this.db.tx(() => this.txnsRepo.update(id, upd)),
      )

      if (ledgerEntry !== null) {
        // Post-ledger: update ledger entry amount and recompute balance.
        await wrapping('service.UpdateTransaction: update ledger amount', () =>
          this.ledgerSvc.updateEntryAmount(ledgerEntry.id, amount),
        )
      } else {
        // Legacy transaction: record a manual_adjustment for the amount delta.
        let delta = amount - oldTxn.amount
        if (oldTxn.isInstallment) {
          delta = (amount - oldTxn.amount) * oldTxn.paidInstallments
        }
        await wrapping('service.UpdateTransaction: adjust balance', () =>
          this.ledgerSvc.recordEntry({
            accountId: oldTxn.accountId,
            transactionId: null,
            payScheduleId: null,
            entryType: 'manual_adjustment',
            amount: delta,
            description: oldTxn.title,
            postedAt: new Date(),
          }),
        )
      }

      return
    }

    // No amount change - simple update without balance adjustment.
    await wrapping('service.UpdateTransaction', () => this.txnsRepo.update(id, upd))
  }

  /** Removes a transaction and reverses its balance effect (D-02 style), atomically when it has one. */
  async deleteTransaction(id: string): Promise<void> {
    const t = await wrapping('service.DeleteTransaction: get transaction', () => this.txnsRepo.getById(id))

    // Looked up before any tx (MaxOpenConns=1 in Go).
    const ledgerEntry = await wrapping('service.DeleteTransaction: find ledger', () =>
      this.ledgerSvc.findByTransactionId(id),
    )

    // Ledger rows are money records and reference the transaction (FK), so a transaction with one
    // cannot be deleted. Go's delete failed here with the FK error (a 500); this is a 409.
    if (ledgerEntry !== null) {
      throw ErrTransactionHasLedger
    }

    if (!hasAppliedToBalance(t, new Date())) {
      await wrapping('service.DeleteTransaction: delete', () => this.txnsRepo.deleteById(id))
      return
    }

    // Legacy transaction: record a manual_adjustment reversal, then delete.
    const reversalAmount = t.isInstallment ? -(t.amount * t.paidInstallments) : -t.amount

    await this.db.tx(async () => {
      await wrapping('service.DeleteTransaction: delete', () => this.txnsRepo.deleteById(id))
      await wrapping('service.DeleteTransaction: adjust balance', () =>
        this.ledgerSvc.recordEntry(
          {
            accountId: t.accountId,
            transactionId: null,
            payScheduleId: null,
            entryType: 'manual_adjustment',
            amount: reversalAmount,
            description: t.title,
            postedAt: new Date(),
          },
          true,
        ),
      )
    })
  }

  /**
   * Confirms a recurring or one-time due transaction and applies its amount to the account
   * balance. For recurring transactions, it also advances next_occurrence. Returns the new
   * next_occurrence, or null (Go's zero time) when there is none. D-03: the user must confirm
   * explicitly before anything is debited.
   */
  async confirmRecurring(transactionId: string): Promise<Date | null> {
    const t = await wrapping('service.ConfirmRecurring: get transaction', () => this.txnsRepo.getById(transactionId))

    if (!t.isRecurring && t.confirmedAt !== null) {
      // Idempotent for already confirmed one-time pending payments.
      return null
    }

    const isOneTimeDue = !t.isRecurring && t.requiresConfirmation && t.confirmedAt === null
    if (!t.isRecurring && !isOneTimeDue) {
      throw new AppError(`service.ConfirmRecurring: transaction ${transactionId} is not confirmable`)
    }

    return this.db.tx(async (): Promise<Date | null> => {
      const now = new Date()
      await wrapping('service.ConfirmRecurring: record ledger', () =>
        this.ledgerSvc.recordEntry(
          {
            accountId: t.accountId,
            transactionId: t.id,
            payScheduleId: null,
            entryType: 'payment',
            amount: t.amount,
            description: t.title,
            postedAt: now,
          },
          true,
        ),
      )

      let next: Date | null = null
      if (t.isRecurring && t.nextOccurrence !== null && t.frequency !== null) {
        const advanced = advanceOccurrence(t.nextOccurrence, t.frequency)
        await wrapping('service.ConfirmRecurring: advance next_occurrence', () =>
          this.txnsRepo.advanceNextOccurrence(transactionId, advanced),
        )
        next = advanced
      }
      if (isOneTimeDue) {
        await wrapping('service.ConfirmRecurring: mark confirmed', () =>
          this.txnsRepo.markConfirmed(transactionId, now),
        )
      }
      return next
    })
  }

  /** Confirms one installment payment: debits the per-installment amount and increments paid_installments. */
  async confirmInstallment(transactionId: string): Promise<void> {
    const t = await wrapping('service.ConfirmInstallment: get transaction', () =>
      this.txnsRepo.getById(transactionId),
    )

    if (!t.isInstallment) {
      throw new AppError(`service.ConfirmInstallment: transaction ${transactionId} is not an installment`)
    }
    if (t.totalInstallments === null || t.paidInstallments >= t.totalInstallments) {
      throw new AppError(`service.ConfirmInstallment: all installments already paid for transaction ${transactionId}`)
    }

    await this.db.tx(async () => {
      await wrapping('service.ConfirmInstallment: record ledger', () =>
        this.ledgerSvc.recordEntry(
          {
            accountId: t.accountId,
            transactionId: t.id,
            payScheduleId: null,
            entryType: 'payment',
            amount: t.amount,
            description: t.title,
            postedAt: new Date(),
          },
          true,
        ),
      )
      await wrapping('service.ConfirmInstallment: increment paid', () =>
        this.txnsRepo.incrementPaidInstallments(transactionId),
      )
    })
  }

  /** Advances next_occurrence by one interval without touching the balance (a skipped cycle). */
  async postponeRecurring(transactionId: string): Promise<Date> {
    const t = await wrapping('service.PostponeRecurring: get transaction', () =>
      this.txnsRepo.getById(transactionId),
    )
    if (!t.isRecurring) {
      throw new AppError(`service.PostponeRecurring: transaction ${transactionId} is not recurring`)
    }
    if (t.nextOccurrence === null || t.frequency === null) {
      throw new AppError(`service.PostponeRecurring: transaction ${transactionId} missing next_occurrence or frequency`)
    }
    const next = advanceOccurrence(t.nextOccurrence, t.frequency)
    await wrapping('service.PostponeRecurring: advance next_occurrence', () =>
      this.txnsRepo.advanceNextOccurrence(transactionId, next),
    )
    return next
  }
}

/** Whether a transaction being created should impact the account balance immediately. */
function shouldApplyBalanceOnCreate(t: Transaction, now: Date): boolean {
  if (t.isInstallment) {
    return false // installment txns only debit balance on each confirm-installment
  }
  if (t.requiresConfirmation && t.confirmedAt === null) {
    return false
  }
  if (t.isRecurring && t.anchorDate !== null && t.anchorDate.getTime() > now.getTime()) {
    return false
  }
  return true
}

/** Whether a stored transaction is currently represented in the account balance. */
function hasAppliedToBalance(t: Transaction, now: Date): boolean {
  if (t.isInstallment) {
    return t.paidInstallments > 0
  }
  if (t.requiresConfirmation && t.confirmedAt === null) {
    return false
  }
  if (t.isRecurring && t.anchorDate !== null && t.anchorDate.getTime() > now.getTime()) {
    return false
  }
  return true
}

/** The next occurrence after `current` for a frequency. Unknown frequencies are treated as monthly. */
function advanceOccurrence(current: Date, frequency: string): Date {
  switch (frequency) {
    case FREQ_WEEKLY:
      return addDays(current, 7)
    case FREQ_BI_WEEKLY:
    case 'biweekly':
      return addDays(current, 14)
    case FREQ_MONTHLY:
      return addMonthClamped(current, 1)
    case FREQ_YEARLY:
      return addMonthClamped(current, 12)
    default:
      // Fallback — treat as monthly
      return addMonthClamped(current, 1)
  }
}
