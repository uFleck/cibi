package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

func main() {
	dbPath := flag.String("db", "", "path to cibi.db")
	flag.Parse()
	if *dbPath == "" {
		log.Fatal("usage: backfill -db path/to/cibi.db")
	}

	db, err := sql.Open("sqlite", *dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := backfill(db); err != nil {
		log.Fatalf("backfill: %v", err)
	}
	fmt.Println("backfill complete")
}

func backfill(db *sql.DB) error {
	rows, err := db.Query(`
		SELECT t.id, t.account_id, t.amount, t.description, t.timestamp,
		       t.is_installment, t.paid_installments, t.anchor_date, t.frequency
		FROM "Transaction" t
		WHERE t.type = 'personal'
		  AND (
		    (t.is_installment = 0 AND (t.requires_confirmation = 0 OR t.confirmed_at IS NOT NULL)
		         AND NOT (t.is_recurring = 1 AND t.anchor_date > datetime('now')))
		    OR (t.is_installment = 1 AND t.paid_installments > 0)
		  )
		  AND NOT EXISTS (SELECT 1 FROM ledger WHERE ledger.transaction_id = t.id)
	`)
	if err != nil {
		return fmt.Errorf("query transactions: %w", err)
	}
	defer rows.Close()

	type txnRow struct {
		id               string
		accountID        string
		amount           int64
		description      string
		timestamp        string
		isInstallment    bool
		paidInstallments int64
		anchorDate       sql.NullString
		frequency        sql.NullString
	}

	var txns []txnRow
	for rows.Next() {
		var r txnRow
		if err := rows.Scan(&r.id, &r.accountID, &r.amount, &r.description, &r.timestamp,
			&r.isInstallment, &r.paidInstallments, &r.anchorDate, &r.frequency); err != nil {
			return fmt.Errorf("scan: %w", err)
		}
		txns = append(txns, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, t := range txns {
		ts, _ := time.Parse(time.RFC3339, t.timestamp)
		if t.isInstallment && t.paidInstallments > 0 {
			anchor := ts
			if t.anchorDate.Valid {
				anchor, _ = time.Parse(time.RFC3339, t.anchorDate.String)
			}
			for i := int64(0); i < t.paidInstallments; i++ {
				posted := advanceN(anchor, t.frequency.String, int(i))
				id := uuid.New().String()
				_, err := db.Exec(`INSERT INTO ledger (id, account_id, transaction_id, entry_type, amount, description, posted_at) VALUES (?,?,?,'payment',?,?,?)`,
					id, t.accountID, t.id, t.amount, t.description, posted.UTC().Format(time.RFC3339))
				if err != nil {
					return fmt.Errorf("insert ledger for installment %v: %w", t.id, err)
				}
			}
		} else {
			id := uuid.New().String()
			_, err := db.Exec(`INSERT INTO ledger (id, account_id, transaction_id, entry_type, amount, description, posted_at) VALUES (?,?,?,'payment',?,?,?)`,
				id, t.accountID, t.id, t.amount, t.description, ts.UTC().Format(time.RFC3339))
			if err != nil {
				return fmt.Errorf("insert ledger for txn %v: %w", t.id, err)
			}
		}
	}

	accRows, err := db.Query(`SELECT id, current_balance FROM Account`)
	if err != nil {
		return fmt.Errorf("query accounts: %w", err)
	}
	defer accRows.Close()
	for accRows.Next() {
		var accID string
		var currentBalance int64
		if err := accRows.Scan(&accID, &currentBalance); err != nil {
			return err
		}
		var paymentSum int64
		db.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM ledger WHERE account_id = ? AND entry_type != 'opening_balance'`, accID).Scan(&paymentSum)
		newOpeningBalance := currentBalance - paymentSum
		_, err := db.Exec(`UPDATE ledger SET amount = ? WHERE account_id = ? AND entry_type = 'opening_balance'`, newOpeningBalance, accID)
		if err != nil {
			return fmt.Errorf("update opening_balance for account %v: %w", accID, err)
		}
	}
	return accRows.Err()
}

func advanceN(base time.Time, frequency string, n int) time.Time {
	t := base
	for i := 0; i < n; i++ {
		switch frequency {
		case "weekly":
			t = t.AddDate(0, 0, 7)
		case "bi-weekly", "biweekly":
			t = t.AddDate(0, 0, 14)
		case "yearly":
			t = t.AddDate(1, 0, 0)
		default:
			t = t.AddDate(0, 1, 0)
		}
	}
	return t
}
