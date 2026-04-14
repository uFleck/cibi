package main

import (
	"fmt"
	"math"
	"strconv"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

var checkCmd = &cobra.Command{
	Use:   "check <amount>",
	Short: "Check if you can afford a purchase",
	Long:  "Checks if you can buy an item at the given price (in decimal dollars) using the default account.",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		amount, err := strconv.ParseFloat(args[0], 64)
		if err != nil {
			return fmt.Errorf("invalid amount: %w", err)
		}
		cents := int64(math.Round(amount * 100))

		result, err := application.EngineSvc.CanIBuyItDefault(cents)
		if err != nil {
			return fmt.Errorf("engine error: %w", err)
		}

		yesStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("10"))
		waitStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("11"))
		noStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("9"))
		labelStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("8"))

		switch {
		case result.CanBuy:
			fmt.Println(yesStyle.Render("YES — you can afford it"))
		case result.WillAffordAfterPayday && result.WaitUntil != nil:
			fmt.Println(waitStyle.Render(fmt.Sprintf("WAIT — you'll afford it after %s", result.WaitUntil.Format("2006-01-02"))))
		default:
			fmt.Println(noStyle.Render("NO — insufficient funds"))
		}

		fmt.Printf("%s $%.2f\n", labelStyle.Render("Purchasing power:"), float64(result.PurchasingPower)/100.0)
		fmt.Printf("%s $%.2f\n", labelStyle.Render("Buffer remaining: "), float64(result.BufferRemaining)/100.0)
		fmt.Printf("%s %s\n", labelStyle.Render("Risk level:      "), result.RiskLevel)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(checkCmd)
}
