-- Free-text category per transaction. Nullable: existing rows stay uncategorized until the classifier or the user sets one.
--> statement-breakpoint
ALTER TABLE "Transaction" ADD COLUMN category TEXT;
