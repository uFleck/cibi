-- The reserve: money set aside on each payday that the "Can I Buy It?" check treats as untouchable.
-- It is virtual (the money stays in the account); moved_at records that the user also moved it to
-- a real place such as an investment. A contribution is for one payday of one pay schedule, once.
--> statement-breakpoint
CREATE TABLE ReserveEntry (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES Account(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('contribution', 'withdrawal')),
  pay_schedule_id TEXT,
  payday          TEXT,
  note            TEXT,
  posted_at       TEXT NOT NULL,
  moved_at        TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_reserve_payday ON ReserveEntry(pay_schedule_id, payday)
  WHERE kind = 'contribution' AND pay_schedule_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_reserve_account ON ReserveEntry(account_id, posted_at);
