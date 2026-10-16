-- A recurring expense can take its amount from history: the median of the last payments whose
-- category (estimate_source 'category') or text (estimate_source 'keyword') matches estimate_key.
-- Both columns are null for a fixed amount, which keeps using Transaction.amount.
ALTER TABLE "Transaction" ADD COLUMN estimate_source TEXT;
--> statement-breakpoint
ALTER TABLE "Transaction" ADD COLUMN estimate_key TEXT;
