package services

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/ufleck/cibi-api/data"
	"github.com/ufleck/cibi-api/repos"
	"github.com/ufleck/cibi-api/types"
)

type TransactionsSrvc struct {
	repo    repos.TransactionsRepo
	accRepo repos.AccountsRepo
}

func NewTransactionsSrvc(txnsRepo repos.TransactionsRepo, accRepo repos.AccountsRepo) TransactionsSrvc {
	return TransactionsSrvc{
		repo:       txnsRepo,
		accRepo: accRepo,
	}
}

func (srvc *TransactionsSrvc) CreateTransaction(newt types.NewTransaction) error {
	acc, err := srvc.accRepo.GetById(newt.AccountId)
	if err != nil {
		fmt.Println(err)
		return fmt.Errorf("Could not get default account: %w", err)
	}

	t := data.NewTransaction(newt.Name, newt.Description, newt.Value, newt.EvaluatesAt)

	err = srvc.repo.Insert(t, acc)
	if err != nil {
		fmt.Println(err)
		return fmt.Errorf("Could not create transaction: %w", err)
	}

	return nil
}

func (srvc *TransactionsSrvc) GetAccTransactions(accId uuid.UUID) (data.Transactions, error) {
	txns, err := srvc.repo.GetAccTxns(accId)
	if err != nil {
		return nil, fmt.Errorf("Could not get acc transactions: %w", err)
	}

	return txns, nil
}
