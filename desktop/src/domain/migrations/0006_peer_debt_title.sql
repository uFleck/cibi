-- The peer_debts view exposes the title as title now, matching the peer debt API.
--> statement-breakpoint
DROP VIEW peer_debts;
--> statement-breakpoint
CREATE VIEW peer_debts AS
			SELECT
				id, account_id, friend_id,
				amount, title,
				timestamp AS date,
				is_installment, total_installments, paid_installments,
				frequency, anchor_date,
				CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END AS is_confirmed
			FROM "Transaction"
			WHERE type = 'peer';
