-- Schema of the Go server at goose version 20261009000001. Statements are separated by the marker line --> statement-breakpoint
--> statement-breakpoint
CREATE TABLE Account (
			id TEXT PRIMARY KEY,
			name TEXT,
			current_balance INTEGER,
			currency TEXT,
			is_default BOOLEAN
		, safety_buffer INTEGER NOT NULL DEFAULT 1000, version INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE AccountProfile (
	account_id    TEXT PRIMARY KEY REFERENCES Account(id) ON DELETE CASCADE,
	display_name  TEXT NOT NULL,
	pix_key       TEXT
, theme TEXT NOT NULL DEFAULT 'neutral-command', public_base_url TEXT);
--> statement-breakpoint
CREATE TABLE Friend (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    public_token TEXT NOT NULL UNIQUE,
    notes        TEXT
, pix_key TEXT);
--> statement-breakpoint
CREATE TABLE Goal (
			id TEXT PRIMARY KEY,
			account_id TEXT NOT NULL REFERENCES Account(id),
			name TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('draft','active','completed','archived')),
			target_amount_cents INTEGER NOT NULL CHECK (target_amount_cents > 0),
			invested_total_cents INTEGER NOT NULL DEFAULT 0,
			start_date_utc TEXT NOT NULL,
			target_date_utc TEXT,
			notes TEXT,
			currency TEXT NOT NULL,
			created_at_utc TEXT NOT NULL,
			updated_at_utc TEXT NOT NULL
		, min_contribution_per_window_cents INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE GoalLedgerEntry (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL REFERENCES Goal(id),
			amount_cents INTEGER NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('contribution','withdrawal','adjustment')),
			source TEXT NOT NULL CHECK (source IN ('manual','system','recurring')),
			note TEXT,
			reverses_entry_id TEXT REFERENCES GoalLedgerEntry(id),
			timestamp_utc TEXT NOT NULL,
			created_at_utc TEXT NOT NULL
		);
--> statement-breakpoint
CREATE TABLE GoalRecurringContribution (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL REFERENCES Goal(id),
			amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
			frequency TEXT NOT NULL CHECK (frequency IN ('weekly','bi-weekly','monthly','yearly')),
			anchor_date_utc TEXT NOT NULL,
			next_due_utc TEXT NOT NULL,
			active BOOLEAN NOT NULL DEFAULT 1,
			created_at_utc TEXT NOT NULL,
			updated_at_utc TEXT NOT NULL
		);
--> statement-breakpoint
CREATE TABLE GoalTargetAudit (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL REFERENCES Goal(id),
			previous_target_amount_cents INTEGER NOT NULL,
			new_target_amount_cents INTEGER NOT NULL,
			changed_at_utc TEXT NOT NULL,
			note TEXT
		);
--> statement-breakpoint
CREATE TABLE GroupEvent (
			id             TEXT PRIMARY KEY,
			title          TEXT NOT NULL,
			date           TEXT NOT NULL,
			total_amount   INTEGER NOT NULL,
			public_token   TEXT NOT NULL UNIQUE,
			notes          TEXT,
			host_friend_id TEXT REFERENCES Friend(id),
			account_id     TEXT NOT NULL REFERENCES Account(id)
		);
--> statement-breakpoint
CREATE TABLE GroupEventParticipant (
			event_id     TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
			friend_id    TEXT REFERENCES Friend(id),
			share_amount INTEGER NOT NULL,
			is_confirmed BOOLEAN NOT NULL DEFAULT 0
		);
--> statement-breakpoint
CREATE TABLE GroupEventTransaction (
			id          TEXT PRIMARY KEY,
			event_id    TEXT NOT NULL REFERENCES GroupEvent(id) ON DELETE CASCADE,
			description TEXT NOT NULL,
			amount      INTEGER NOT NULL,
			created_at  TEXT NOT NULL DEFAULT (datetime('now'))
		);
--> statement-breakpoint
CREATE TABLE PaySchedule (
			id TEXT PRIMARY KEY,
			account_id TEXT REFERENCES Account(id),
			frequency TEXT,
			anchor_date TEXT,
			day_of_month2 INTEGER,
			label TEXT
		, amount INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE PeerDebt (
			id                 TEXT PRIMARY KEY,
			friend_id          TEXT NOT NULL REFERENCES Friend(id) ON DELETE CASCADE,
			amount             INTEGER NOT NULL,
			description        TEXT NOT NULL,
			date               TEXT NOT NULL,
			is_installment     BOOLEAN NOT NULL DEFAULT 0,
			total_installments INTEGER,
			paid_installments  INTEGER NOT NULL DEFAULT 0,
			frequency          TEXT,
			anchor_date        TEXT,
			is_confirmed       BOOLEAN NOT NULL DEFAULT 0,
			account_id         TEXT NOT NULL REFERENCES Account(id)
		);
--> statement-breakpoint
CREATE TABLE Plan (
			id TEXT PRIMARY KEY,
			base_account_id TEXT NOT NULL REFERENCES Account(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'draft',
			horizon_start TEXT NOT NULL,
			horizon_end TEXT NOT NULL,
			base_version_at_create INTEGER NOT NULL,
			last_rebased_version INTEGER NOT NULL,
			needs_rebase BOOLEAN NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
--> statement-breakpoint
CREATE TABLE PlanAction (
			id TEXT PRIMARY KEY,
			plan_id TEXT NOT NULL REFERENCES Plan(id) ON DELETE CASCADE,
			op_type TEXT NOT NULL,
			target_tx_id TEXT,
			payload_json TEXT NOT NULL DEFAULT '{}',
			state TEXT NOT NULL DEFAULT 'active',
			conflict_reason TEXT,
			applied_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
--> statement-breakpoint
CREATE TABLE PlanApplyRun (
		id TEXT PRIMARY KEY,
		plan_id TEXT NOT NULL REFERENCES Plan(id) ON DELETE CASCADE,
		idempotency_key TEXT NOT NULL,
		action_ids_json TEXT NOT NULL,
		status TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		UNIQUE(plan_id, idempotency_key)
	);
--> statement-breakpoint
CREATE TABLE "Transaction" (
			id TEXT PRIMARY KEY,
			account_id TEXT REFERENCES Account(id),
			amount INTEGER,
			description TEXT,
			timestamp TEXT,
			is_recurring BOOLEAN,
			frequency TEXT,
			anchor_date TEXT,
			next_occurrence TEXT
		, origin TEXT, source_id TEXT, requires_confirmation BOOLEAN NOT NULL DEFAULT 0, confirmed_at TEXT, is_installment BOOLEAN NOT NULL DEFAULT FALSE, total_installments INTEGER, paid_installments INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'personal', friend_id TEXT REFERENCES Friend(id));
--> statement-breakpoint
CREATE TABLE UserProfile (
	id           INTEGER PRIMARY KEY CHECK (id = 1),
	display_name TEXT NOT NULL
, pix_key TEXT);
--> statement-breakpoint
CREATE TABLE ledger (
			id              TEXT PRIMARY KEY,
			account_id      TEXT NOT NULL REFERENCES Account(id) ON DELETE CASCADE,
			transaction_id  TEXT REFERENCES "Transaction"(id),
			pay_schedule_id TEXT REFERENCES PaySchedule(id),
			entry_type      TEXT NOT NULL CHECK(entry_type IN (
				'payment', 'income', 'opening_balance', 'manual_adjustment'
			)),
			amount          INTEGER NOT NULL,
			description     TEXT NOT NULL,
			posted_at       TEXT NOT NULL
		);
--> statement-breakpoint
CREATE TABLE peer_debts_backup(
  id TEXT,
  friend_id TEXT,
  amount INT,
  description TEXT,
  date TEXT,
  is_installment NUM,
  total_installments INT,
  paid_installments INT,
  frequency TEXT,
  anchor_date TEXT,
  is_confirmed NUM,
  account_id TEXT
);
--> statement-breakpoint
CREATE VIEW peer_debts AS
			SELECT
				id, account_id, friend_id,
				amount, description,
				timestamp AS date,
				is_installment, total_installments, paid_installments,
				frequency, anchor_date,
				CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END AS is_confirmed
			FROM "Transaction"
			WHERE type = 'peer';
--> statement-breakpoint
CREATE UNIQUE INDEX idx_gep_host ON GroupEventParticipant(event_id) WHERE friend_id IS NULL;
--> statement-breakpoint
CREATE INDEX idx_get_event_id ON GroupEventTransaction(event_id);
--> statement-breakpoint
CREATE INDEX idx_goal_account_id ON Goal(account_id);
--> statement-breakpoint
CREATE INDEX idx_goal_ledger_goal_id ON GoalLedgerEntry(goal_id);
--> statement-breakpoint
CREATE INDEX idx_goal_recurring_goal_id ON GoalRecurringContribution(goal_id);
--> statement-breakpoint
CREATE INDEX idx_goal_recurring_next_due ON GoalRecurringContribution(next_due_utc);
--> statement-breakpoint
CREATE INDEX idx_goal_target_audit_goal_id ON GoalTargetAudit(goal_id);
--> statement-breakpoint
CREATE INDEX idx_group_event_account_id ON GroupEvent(account_id);
--> statement-breakpoint
CREATE INDEX idx_ledger_account_id ON ledger(account_id);
--> statement-breakpoint
CREATE INDEX idx_ledger_posted_at  ON ledger(posted_at);
--> statement-breakpoint
CREATE INDEX idx_peer_debt_account_id ON PeerDebt(account_id);
--> statement-breakpoint
CREATE INDEX idx_plan_action_plan ON PlanAction(plan_id);
--> statement-breakpoint
CREATE INDEX idx_plan_base_account ON Plan(base_account_id);
