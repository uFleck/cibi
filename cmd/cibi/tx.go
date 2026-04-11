package main

import (
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

var txCmd = &cobra.Command{
	Use:   "tx",
	Short: "Manage transactions",
}

var txListCmd = &cobra.Command{
	Use:   "list",
	Short: "List transactions",
	RunE: func(cmd *cobra.Command, args []string) error {
		accountStr, _ := cmd.Flags().GetString("account")

		var accountID uuid.UUID
		if accountStr != "" {
			id, err := uuid.Parse(accountStr)
			if err != nil {
				return fmt.Errorf("invalid account ID: %w", err)
			}
			accountID = id
		} else {
			acc, err := application.AccountsSvc.GetDefault()
			if err != nil {
				return fmt.Errorf("failed to get default account (use --account to specify): %w", err)
			}
			accountID = acc.ID
		}

		txns, err := application.TxnsSvc.ListTransactions(accountID)
		if err != nil {
			return fmt.Errorf("failed to list transactions: %w", err)
		}

		fmt.Printf("%-36s  %10s  %-30s  %-9s  %s\n", "ID", "AMOUNT", "DESCRIPTION", "RECURRING", "NEXT")
		fmt.Printf("%-36s  %10s  %-30s  %-9s  %s\n", "------------------------------------", "----------", "------------------------------", "---------", "----")
		for _, t := range txns {
			amount := fmt.Sprintf("%.2f", float64(t.Amount)/100.0)
			rec := "no"
			if t.IsRecurring {
				rec = "yes"
			}
			next := ""
			if t.NextOccurrence != nil {
				next = t.NextOccurrence.Format("2006-01-02")
			}
			desc := t.Description
			if len(desc) > 30 {
				desc = desc[:27] + "..."
			}
			fmt.Printf("%-36s  %10s  %-30s  %-9s  %s\n", t.ID.String(), amount, desc, rec, next)
		}
		return nil
	},
}

var txAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a transaction",
	RunE: func(cmd *cobra.Command, args []string) error {
		amountFloat, _ := cmd.Flags().GetFloat64("amount")
		description, _ := cmd.Flags().GetString("description")
		category, _ := cmd.Flags().GetString("category")
		isRecurring, _ := cmd.Flags().GetBool("recurring")
		frequency, _ := cmd.Flags().GetString("frequency")
		anchorStr, _ := cmd.Flags().GetString("anchor")
		accountStr, _ := cmd.Flags().GetString("account")

		amountCents := int64(math.Round(amountFloat * 100))

		var accountID uuid.UUID
		if accountStr != "" {
			id, err := uuid.Parse(accountStr)
			if err != nil {
				return fmt.Errorf("invalid account ID: %w", err)
			}
			accountID = id
		} else {
			acc, err := application.AccountsSvc.GetDefault()
			if err != nil {
				return fmt.Errorf("failed to get default account (use --account to specify): %w", err)
			}
			accountID = acc.ID
		}

		t := sqlite.Transaction{
			ID:          uuid.New(),
			AccountID:   accountID,
			Amount:      amountCents,
			Description: description,
			Category:    category,
			IsRecurring: isRecurring,
		}

		if isRecurring {
			if frequency == "" || anchorStr == "" {
				return fmt.Errorf("frequency and anchor are required for recurring transactions")
			}
			t.Frequency = &frequency

			parsed, err := time.Parse("2006-01-02", anchorStr)
			if err != nil {
				return fmt.Errorf("invalid anchor date (expected YYYY-MM-DD): %w", err)
			}
			anchor := time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
			t.AnchorDate = &anchor
		}

		if err := application.TxnsSvc.CreateTransaction(t); err != nil {
			return fmt.Errorf("failed to create transaction: %w", err)
		}
		fmt.Printf("Transaction created: %s\n", t.ID.String())
		return nil
	},
}

var txUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a transaction",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		id, err := uuid.Parse(args[0])
		if err != nil {
			return fmt.Errorf("invalid transaction ID: %w", err)
		}

		upd := sqlite.UpdateTransaction{}
		if cmd.Flags().Changed("description") {
			d, _ := cmd.Flags().GetString("description")
			upd.Description = &d
		}
		if cmd.Flags().Changed("category") {
			c, _ := cmd.Flags().GetString("category")
			upd.Category = &c
		}
		if cmd.Flags().Changed("amount") {
			a, _ := cmd.Flags().GetFloat64("amount")
			cents := int64(math.Round(a * 100))
			upd.Amount = &cents
		}

		if err := application.TxnsSvc.UpdateTransaction(id, upd); err != nil {
			return fmt.Errorf("failed to update transaction: %w", err)
		}
		fmt.Println("Transaction updated")
		return nil
	},
}

var txDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a transaction",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		id, err := uuid.Parse(args[0])
		if err != nil {
			return fmt.Errorf("invalid transaction ID: %w", err)
		}
		if err := application.TxnsSvc.DeleteTransaction(id); err != nil {
			return fmt.Errorf("failed to delete transaction: %w", err)
		}
		fmt.Println("Transaction deleted")
		return nil
	},
}

func init() {
	txListCmd.Flags().String("account", "", "account ID to list transactions for (defaults to default account)")

	txAddCmd.Flags().Float64("amount", 0, "amount in decimal dollars, negative for debits (e.g., -850.00)")
	txAddCmd.Flags().String("description", "", "transaction description")
	txAddCmd.Flags().String("category", "", "transaction category")
	txAddCmd.Flags().Bool("recurring", false, "mark as recurring")
	txAddCmd.Flags().String("frequency", "", "recurrence frequency: weekly, bi-weekly, monthly, yearly")
	txAddCmd.Flags().String("anchor", "", "anchor date for recurrence in YYYY-MM-DD format")
	txAddCmd.Flags().String("account", "", "account ID (defaults to default account)")

	txUpdateCmd.Flags().Float64("amount", 0, "new amount in decimal dollars")
	txUpdateCmd.Flags().String("description", "", "new description")
	txUpdateCmd.Flags().String("category", "", "new category")

	txCmd.AddCommand(txListCmd, txAddCmd, txUpdateCmd, txDeleteCmd)
	rootCmd.AddCommand(txCmd)
}
