package main

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

func resolveAccountID(idStr string) (uuid.UUID, error) {
	if id, err := uuid.Parse(idStr); err == nil {
		return id, nil
	}

	accounts, err := application.AccountsSvc.ListAccounts()
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to list accounts: %w", err)
	}

	var matches []sqlite.Account
	for _, a := range accounts {
		if len(a.ID.String()) >= len(idStr) && a.ID.String()[:len(idStr)] == idStr {
			matches = append(matches, a)
		}
	}

	if len(matches) == 0 {
		return uuid.Nil, fmt.Errorf("no account found matching %q", idStr)
	}
	if len(matches) > 1 {
		fmt.Println("Multiple accounts match:")
		for _, a := range matches {
			fmt.Printf("  %s  %s\n", a.ID.String()[:8], a.Name)
		}
		return uuid.Nil, fmt.Errorf("ambiguous account ID: %q matches %d accounts", idStr, len(matches))
	}

	return matches[0].ID, nil
}

func resolveTransactionID(idStr string, accountID uuid.UUID) (uuid.UUID, error) {
	if id, err := uuid.Parse(idStr); err == nil {
		return id, nil
	}

	txns, err := application.TxnsSvc.ListTransactions(accountID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to list transactions: %w", err)
	}

	var matches []sqlite.Transaction
	for _, t := range txns {
		if len(t.ID.String()) >= len(idStr) && t.ID.String()[:len(idStr)] == idStr {
			matches = append(matches, t)
		}
	}

	if len(matches) == 0 {
		return uuid.Nil, fmt.Errorf("no transaction found matching %q", idStr)
	}
	if len(matches) > 1 {
		fmt.Println("Multiple transactions match:")
		for _, t := range matches {
			desc := t.Description
			if len(desc) > 30 {
				desc = desc[:27] + "..."
			}
			fmt.Printf("  %s  %.2f  %s\n", t.ID.String()[:8], float64(t.Amount)/100.0, desc)
		}
		return uuid.Nil, fmt.Errorf("ambiguous transaction ID: %q matches %d transactions", idStr, len(matches))
	}

	return matches[0].ID, nil
}