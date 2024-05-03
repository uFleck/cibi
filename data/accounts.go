package data

import (
	"github.com/google/uuid"
)

type Account struct {
	Id           uuid.UUID    `json:"id"`
	Name         string       `json:"name"`
	Balance      float64      `json:"balance"`
	Transactions Transactions `json:"transactions,omitempty"`
	IsDefault    bool         `json:"is_default"`
}

type Accounts []Account

func NewAccount(name string, isDefault bool) Account {
	return Account{
		Id:           uuid.New(),
		Name:         name,
		Balance:      0,
		Transactions: []Transaction{},
		IsDefault:    isDefault,
	}
}

func (a *Account) AddTransaction(t Transaction) error {
	a.Transactions = append(a.Transactions, t)

	if t.Evaluated {
		a.Balance += t.Value
	}

	return nil
}
