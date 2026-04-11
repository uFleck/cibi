package services

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi-api/data"
	"github.com/ufleck/cibi-api/repos"
	"github.com/ufleck/cibi-api/types"
)

type AccountsSrvc struct {
	repo     repos.AccountsRepo
	txRepo   repos.TransactionsRepo
	txnsSrvc TransactionsSrvc
}

func NewAccountsSrvc(repo repos.AccountsRepo, txRepo repos.TransactionsRepo, txnsSrvc TransactionsSrvc) AccountsSrvc {
	return AccountsSrvc{
		repo:     repo,
		txRepo:   txRepo,
		txnsSrvc: txnsSrvc,
	}
}

func (srvc *AccountsSrvc) CreateAccount(newa types.NewAccount) error {
	a := data.NewAccount(newa.Name, newa.IsDefault)
	err := srvc.repo.Insert(a)
	if err != nil {
		return fmt.Errorf("Could not create account. Error when inserting: %w", err)
	}

	return nil
}

func (srvc *AccountsSrvc) GetAccounts() (data.Accounts, error) {
	allAccs, err := srvc.repo.GetAll()
	if err != nil {
		return allAccs, fmt.Errorf("Could not get default account: %w", err)
	}

	return allAccs, nil
}

func (srvc *AccountsSrvc) GetAccountById(id uuid.UUID) (*data.Account, error) {
	acc, err := srvc.repo.GetById(id)
	if err != nil {
		return nil, fmt.Errorf("Could not get account by id: %w", err)
	}

	txns, err := srvc.txnsSrvc.GetAccTransactions(id)
	if err != nil {
		return nil, err
	}

	acc.Transactions = txns

	return &acc, nil
}

func (srvc *AccountsSrvc) GetDefaultAccount() (data.Account, error) {
	defAcc, err := srvc.repo.GetDefault()
	if err != nil {
		return defAcc, fmt.Errorf("Could not get default account: %w", err)
	}

	txns, err := srvc.txRepo.GetAccTxns(defAcc.Id)
	if err != nil {
		return defAcc, fmt.Errorf("Could not get account transactions: %w", err)
	}

	defAcc.Transactions = txns

	return defAcc, nil
}

func (srvc *AccountsSrvc) UpdateAccount(id uuid.UUID, updatedAcc types.UpdateAccount) error {
	if updatedAcc.Name != "" {
		err := srvc.repo.UpdateName(id, updatedAcc.Name)
		if err != nil {
			return fmt.Errorf("Could not update acc name: %w", err)
		}
	}

	if updatedAcc.Balance != nil {
		acc, err := srvc.txnsSrvc.accRepo.GetById(id)
		if err != nil {
			return fmt.Errorf("Could not get acc by id: %w", err)
		}

		txValue := *updatedAcc.Balance - acc.Balance

		tx := data.NewTransaction("Balance Adjust", "", txValue, time.Now())

		err = srvc.txnsSrvc.repo.Insert(tx, acc)
		if err != nil {
			return fmt.Errorf("Could not insert transaction to update acc balance: %w", err)
		}
	}

	if updatedAcc.IsDefault != nil {
		err := srvc.repo.UpdateIsDefault(id, *updatedAcc.IsDefault)
		if err != nil {
			return fmt.Errorf("Could not update is default state: %w", err)
		}
	}

	return nil
}

func (srvc *AccountsSrvc) DeleteAccount(id uuid.UUID) error {
	err := srvc.repo.DeleteById(id)
	if err != nil {
		return fmt.Errorf("Could not delete acc: %w", err)
	}

	return nil
}
