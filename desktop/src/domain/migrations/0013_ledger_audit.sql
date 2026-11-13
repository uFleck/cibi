-- Undo an entry without losing it: a payment or an income keeps its row, and a reversal points at it.
-- occurrence_date is the due date (or the payday) the entry paid, so undoing a recurring bill can put
-- the bill back on exactly that date, even if it was paid late or skipped afterwards.
ALTER TABLE ledger ADD COLUMN occurrence_date TEXT;
--> statement-breakpoint
ALTER TABLE ledger ADD COLUMN reverses_entry_id TEXT;
--> statement-breakpoint
ALTER TABLE ledger ADD COLUMN reversed_by_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ledger_transaction_id ON ledger(transaction_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ledger_pay_schedule_id ON ledger(pay_schedule_id);
