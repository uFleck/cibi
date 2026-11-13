-- An account created before the opening entry existed has a balance but no ledger row to back it.
-- The first payment recomputes the balance from the ledger, so without this the initial money would
-- disappear. Only accounts with no ledger rows at all are touched; anything else already has history.
INSERT INTO ledger (id, account_id, transaction_id, pay_schedule_id, entry_type, amount, description, posted_at)
SELECT lower(hex(randomblob(16))), a.id, NULL, NULL, 'opening_balance', a.current_balance, 'Saldo inicial',
       strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM Account a
WHERE a.current_balance <> 0
  AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.account_id = a.id);
