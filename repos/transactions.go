package repos

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi-api/data"
	"github.com/ufleck/cibi-api/db"
)

type TransactionsRepo interface {
	Insert(t data.Transaction, acc data.Account) error
	GetAccTxns(accountId uuid.UUID) (data.Transactions, error)
	Update(tId uuid.UUID, newt UpdateTransaction) error
}

type SqliteTxnsRepo struct {
	accsRepo AccountsRepo
}

func NewSqliteTxnsRepo(accsRepo AccountsRepo) SqliteTxnsRepo {
	return SqliteTxnsRepo{
		accsRepo: accsRepo,
	}
}

func (repo *SqliteTxnsRepo) Insert(t data.Transaction, acc data.Account) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`insert into transactions (id, account_id, name, description, value, evaluates_at, evaluated_at, evaluated) 
		values (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}

	if t.Evaluated || t.EvaluatesAt.Before(time.Now()) {
		newBalance := acc.Balance + t.Value

		err = repo.accsRepo.UpdateBalance(acc.Id, newBalance, tx)
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("Could not update account balance: %w", err)
		}

		t.Evaluate()
	}

	_, err = stmt.Exec(t.Id, acc.Id, t.Name, t.Description, t.Value, t.EvaluatesAt, t.EvaluatedAt, t.Evaluated)
	if err != nil {
		tx.Rollback()
		return err
	}

	tx.Commit()

	return nil
}

func (repo *SqliteTxnsRepo) GetAccTxns(accountId uuid.UUID) (data.Transactions, error) {
	rows, err := db.Conn.Query("select id, name, description, value, evaluates_at, evaluated_at, evaluated from transactions where account_id = ?", accountId)
	if err != nil {
		return nil, err
	}

	defer rows.Close()

	txns := data.Transactions{}

	for rows.Next() {
		var tx data.Transaction

		if err := rows.Scan(&tx.Id, &tx.Name, &tx.Description,
			&tx.Value, &tx.EvaluatesAt, &tx.EvaluatedAt, &tx.Evaluated); err != nil {
			return nil, err
		}

		fmt.Println(tx)

		txns = append(txns, tx)
	}

	return txns, nil
}

type UpdateTransaction struct {
	Name        string
	Description string
	Value       float64
	EvaluatesAt time.Time
}

func (repo *SqliteTxnsRepo) Update(tId uuid.UUID, newt UpdateTransaction) error {
	var query strings.Builder

	query.WriteString("update transactions")
	if newt.Name != "" {
		query.WriteString(" set name = " + newt.Name)
	}

	if newt.Description != "" {
		query.WriteString(" set description = " + newt.Description)
	}

	if newt.Value != 0.0 {
		query.WriteString(fmt.Sprintf(" set value = %v", newt.Value))
	}

	if newt.EvaluatesAt.IsZero() {
		query.WriteString(fmt.Sprintf(" set value = %v", newt.EvaluatesAt))
	}

	println(query.String())

	query.WriteString(" where id = " + tId.String())

	_, err := db.Conn.Exec(query.String())
	if err != nil {
		return fmt.Errorf("Could not update transaction %v: %w", tId, err)
	}

	return nil
}
