package data

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

type Transaction struct {
	Id          uuid.UUID
	Name        string
	Description string
	Value       float64
	EvaluatesAt time.Time
	EvaluatedAt time.Time
	Evaluated   bool
}

type Transactions []Transaction

func NewTransaction(name string, description string, value float64, evaluatesAt time.Time) Transaction {
	return Transaction{
		Id:          uuid.New(),
		Name:        name,
		Description: description,
		Value:       value,
		EvaluatesAt: evaluatesAt,
		Evaluated:   false,
	}
}

func (t *Transaction) Evaluate() error {
	if t.Evaluated {
		return errors.New("Transaction already evaluated")
	}

	t.Evaluated = true
	t.EvaluatedAt = time.Now()

	return nil
}
