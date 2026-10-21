-- A recurring bill can be marked uncertain ("not sure if we pay it"): it stays listed but is left out of
-- every forecast until it is paid or the mark is cleared.
ALTER TABLE "Transaction" ADD COLUMN is_uncertain INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- An as-needed bill (diapers, wipes) has a budget per calendar month instead of a due date: each payment
-- is subtracted from the month's budget, and the bill never moves to the next occurrence.
ALTER TABLE "Transaction" ADD COLUMN is_as_needed INTEGER NOT NULL DEFAULT 0;
