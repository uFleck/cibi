-- Monthly budget: one limit per category, and the per-month exclusions of scheduled bills.
--> statement-breakpoint
CREATE TABLE Budget (
  category      TEXT PRIMARY KEY,
  monthly_limit INTEGER NOT NULL CHECK (monthly_limit >= 0),
  is_fixed      INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE BudgetExclusion (
  transaction_id TEXT NOT NULL REFERENCES "Transaction"(id) ON DELETE CASCADE,
  month          TEXT NOT NULL,
  PRIMARY KEY (transaction_id, month)
);
