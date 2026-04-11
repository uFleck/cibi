package repos

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/ufleck/cibi-api/data"
	"github.com/ufleck/cibi-api/db"
)

type AccountsRepo interface {
	Insert(a data.Account) error
	UnsetDefaults(tx *sql.Tx) error
	GetAll() (data.Accounts, error)
	GetDefault() (data.Account, error)
	GetById(id uuid.UUID) (data.Account, error)
	UpdateBalance(accountId uuid.UUID, balance float64, tx *sql.Tx) error
	UpdateName(accId uuid.UUID, newname string) error
	UpdateIsDefault(accId uuid.UUID, isDefault bool) error
	DeleteById(accId uuid.UUID) error
}

type SqliteAccRepo struct{}

func (repo *SqliteAccRepo) Insert(a data.Account) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}

	if a.IsDefault {
		err := repo.UnsetDefaults(tx)
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("Could not create account. Error when unsetting defaults: %w", err)
		}
	}

	_, err = tx.Exec("insert into accounts (id, name, balance, is_default) values (?, ?, ?, ?)", a.Id, a.Name, a.Balance, a.IsDefault)
	if err != nil {
		tx.Rollback()
		return err
	}

	tx.Commit()
	return nil
}

func (repo *SqliteAccRepo) UnsetDefaults(tx *sql.Tx) error {
	var err error
	if tx != nil {
		_, err = tx.Exec("update accounts set is_default = 0 where is_default = 1")
	} else {
		_, err = db.Conn.Exec("update accounts set is_default = 0 where is_default = 1")
	}

	if err != nil {
		return err
	}

	return nil
}

func (repo *SqliteAccRepo) GetAll() (data.Accounts, error) {
	var accounts data.Accounts

	rows, err := db.Conn.Query("select * from accounts")
	if err != nil {
		return nil, err
	}

	for rows.Next() {
		var account data.Account

		err := rows.Scan(&account.Id, &account.Name, &account.Balance, &account.IsDefault)
		if err != nil {
			return nil, err
		}

		accounts = append(accounts, account)
	}

	return accounts, nil
}

func (repo *SqliteAccRepo) GetDefault() (data.Account, error) {
	var account data.Account
	err := db.Conn.QueryRow("select * from accounts where is_default = 1").Scan(&account.Id, &account.Name, &account.Balance, &account.IsDefault)

	if err != nil {
		return account, err
	}
	return account, nil
}

func (repo *SqliteAccRepo) GetById(id uuid.UUID) (data.Account, error) {
	var account data.Account
	err := db.Conn.QueryRow("select * from accounts where id = ?", id).Scan(&account.Id, &account.Name, &account.Balance, &account.IsDefault)

	if err != nil {
		return account, err
	}
	return account, nil
}

func (repo *SqliteAccRepo) UpdateBalance(accountId uuid.UUID, balance float64, tx *sql.Tx) error {
	var err error

	if tx != nil {
		_, err = tx.Exec("update accounts set balance = ? where id = ?", balance, accountId)
	} else {
		_, err = db.Conn.Exec("update accounts set balance = ? where id = ?", balance, accountId)
	}

	if err != nil {
		return err
	}

	return nil
}

func (repo *SqliteAccRepo) UpdateName(accId uuid.UUID, newname string) error {
	_, err := db.Conn.Exec("update accounts set name = ? where id = ?", newname, accId)
	if err != nil {
		return err
	}

	return nil
}

func (repo *SqliteAccRepo) UpdateIsDefault(accId uuid.UUID, isDefault bool) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}

	_, err = tx.Exec("update accounts set is_default = ? where id = ?", isDefault, accId)
	if err != nil {
		return err
	}

	err = repo.UnsetDefaults(tx)
	if err != nil {
		tx.Rollback()
		return err
	}

	err = tx.Commit()
	if err != nil {
		return err
	}

	return nil
}

func (repo *SqliteAccRepo) DeleteById(accId uuid.UUID) error {
	tx, err := db.Conn.Begin()
	if err != nil {
		return err
	}

	_, err = tx.Exec("delete from accounts where id = ?", accId)
	if err != nil {
		return err
	}

	_, err = tx.Exec("delete from transactions where account_id = ?", accId)
	if err != nil {
		tx.Rollback()
		return err
	}

	tx.Commit()

	return nil
}
