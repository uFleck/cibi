package main

import (
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

var accountCmd = &cobra.Command{
	Use:   "account",
	Short: "Manage accounts",
}

var accountListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all accounts",
	RunE: func(cmd *cobra.Command, args []string) error {
		accounts, err := application.AccountsSvc.ListAccounts()
		if err != nil {
			return fmt.Errorf("failed to list accounts: %w", err)
		}
		fmt.Printf("%-36s  %-20s  %10s  %s\n", "ID", "NAME", "BALANCE", "DEFAULT")
		fmt.Printf("%-36s  %-20s  %10s  %s\n", "------------------------------------", "--------------------", "----------", "-------")
		for _, a := range accounts {
			def := ""
			if a.IsDefault {
				def = "*"
			}
			balance := fmt.Sprintf("%.2f", float64(a.CurrentBalance)/100.0)
			fmt.Printf("%-36s  %-20s  %10s  %s\n", a.ID.String(), a.Name, balance, def)
		}
		return nil
	},
}

var accountAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a new account",
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		balance, _ := cmd.Flags().GetInt64("balance")
		currency, _ := cmd.Flags().GetString("currency")
		isDefault, _ := cmd.Flags().GetBool("default")

		if name == "" {
			return fmt.Errorf("--name is required")
		}

		a := sqlite.Account{
			ID:             uuid.New(),
			Name:           name,
			CurrentBalance: balance,
			Currency:       currency,
			IsDefault:      isDefault,
		}
		if err := application.AccountsSvc.CreateAccount(a); err != nil {
			return fmt.Errorf("failed to create account: %w", err)
		}
		fmt.Printf("Account created: %s\n", a.ID.String())
		return nil
	},
}

var accountSetDefaultCmd = &cobra.Command{
	Use:   "set-default <id>",
	Short: "Set an account as default",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		id, err := uuid.Parse(args[0])
		if err != nil {
			return fmt.Errorf("invalid account ID: %w", err)
		}
		if err := application.AccountsSvc.SetDefault(id); err != nil {
			return fmt.Errorf("failed to set default: %w", err)
		}
		fmt.Println("Default account updated")
		return nil
	},
}

var accountDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete an account and its transactions",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		id, err := uuid.Parse(args[0])
		if err != nil {
			return fmt.Errorf("invalid account ID: %w", err)
		}
		if err := application.AccountsSvc.DeleteAccount(id); err != nil {
			return fmt.Errorf("failed to delete account: %w", err)
		}
		fmt.Println("Account deleted")
		return nil
	},
}

var accountPayScheduleCmd = &cobra.Command{
	Use:   "set-pay-schedule",
	Short: "Set pay schedule for an account",
	RunE: func(cmd *cobra.Command, args []string) error {
		accountID, _ := cmd.Flags().GetString("account-id")
		frequency, _ := cmd.Flags().GetString("frequency")
		anchorDateStr, _ := cmd.Flags().GetString("anchor-date")
		dayOfMonth, _ := cmd.Flags().GetInt("day-of-month")
		dayOfMonth2, _ := cmd.Flags().GetInt("day-of-month-2")

		var accID uuid.UUID
		var err error

		if accountID == "" {
			// Use default account
			acc, err := application.AccountsSvc.GetDefault()
			if err != nil {
				return fmt.Errorf("no account_id provided and no default account found: %w", err)
			}
			accID = acc.ID
		} else {
			accID, err = uuid.Parse(accountID)
			if err != nil {
				return fmt.Errorf("invalid account_id: %w", err)
			}
		}

		if frequency == "" {
			return fmt.Errorf("--frequency is required (weekly, biweekly, monthly)")
		}
		if anchorDateStr == "" {
			return fmt.Errorf("--anchor-date is required (YYYY-MM-DD)")
		}

		anchorDate, err := time.Parse("2006-01-02", anchorDateStr)
		if err != nil {
			return fmt.Errorf("invalid anchor-date format: %w", err)
		}

		var dom1, dom2 *int
		if dayOfMonth > 0 {
			dom1 = &dayOfMonth
		}
		if dayOfMonth2 > 0 {
			dom2 = &dayOfMonth2
		}

		psSvc := application.PayScheduleSvc
		if err := psSvc.SetPaySchedule(accID, frequency, anchorDate, dom1, dom2, nil); err != nil {
			return fmt.Errorf("failed to set pay schedule: %w", err)
		}

		fmt.Printf("Pay schedule set for account %s\n", accID.String())
		return nil
	},
}

func init() {
	accountAddCmd.Flags().String("name", "", "account name (required)")
	accountAddCmd.Flags().Int64("balance", 0, "initial balance in cents (e.g., 150000 = $1500.00)")
	accountAddCmd.Flags().String("currency", "USD", "currency code")
	accountAddCmd.Flags().Bool("default", false, "set as default account")

	accountPayScheduleCmd.Flags().String("account-id", "", "account ID (uses default if not provided)")
	accountPayScheduleCmd.Flags().String("frequency", "", "pay frequency: weekly, biweekly, monthly (required)")
	accountPayScheduleCmd.Flags().String("anchor-date", "", "first pay date: YYYY-MM-DD (required)")
	accountPayScheduleCmd.Flags().Int("day-of-month", 0, "day of month for monthly (1-31)")
	accountPayScheduleCmd.Flags().Int("day-of-month-2", 0, "second day for biweekly (1-31)")

	accountCmd.AddCommand(accountListCmd, accountAddCmd, accountSetDefaultCmd, accountDeleteCmd, accountPayScheduleCmd)
	rootCmd.AddCommand(accountCmd)

	_ = os.Stderr
}
