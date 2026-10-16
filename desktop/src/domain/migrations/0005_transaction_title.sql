-- A transaction's description becomes its title. The new description is optional free text, and links hang off the transaction.
-- The peer_debts view keeps exposing the title as description: peer debts are a separate API that still calls it that.
--> statement-breakpoint
DROP VIEW peer_debts;
--> statement-breakpoint
ALTER TABLE "Transaction" RENAME COLUMN description TO title;
--> statement-breakpoint
ALTER TABLE "Transaction" ADD COLUMN description TEXT;
--> statement-breakpoint
CREATE VIEW peer_debts AS
			SELECT
				id, account_id, friend_id,
				amount, title AS description,
				timestamp AS date,
				is_installment, total_installments, paid_installments,
				frequency, anchor_date,
				CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END AS is_confirmed
			FROM "Transaction"
			WHERE type = 'peer';
--> statement-breakpoint
CREATE TABLE TransactionLink (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES "Transaction"(id) ON DELETE CASCADE,
  url            TEXT NOT NULL,
  label          TEXT,
  position       INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX idx_transaction_link_txn ON TransactionLink(transaction_id);
