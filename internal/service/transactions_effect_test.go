package service

import (
	"testing"
	"time"

	"github.com/ufleck/cibi/internal/repo/sqlite"
)

func TestBalanceEffect(t *testing.T) {
	now := time.Now().UTC()
	future, past := now.Add(24*time.Hour), now.Add(-24*time.Hour)
	cases := []struct {
		name string
		t    sqlite.Transaction
		want int64
	}{
		{"plain", sqlite.Transaction{Amount: -100}, -100},
		{"installment unpaid", sqlite.Transaction{Amount: -100, IsInstallment: true}, 0},
		{"installment 2 paid", sqlite.Transaction{Amount: -100, IsInstallment: true, PaidInstallments: 2}, -200},
		{"unconfirmed", sqlite.Transaction{Amount: -100, RequiresConfirmation: true}, 0},
		{"confirmed", sqlite.Transaction{Amount: -100, RequiresConfirmation: true, ConfirmedAt: &now}, -100},
		{"recurring future", sqlite.Transaction{Amount: -100, IsRecurring: true, AnchorDate: &future}, 0},
		{"recurring past", sqlite.Transaction{Amount: -100, IsRecurring: true, AnchorDate: &past}, -100},
	}
	for _, c := range cases {
		if got := balanceEffect(c.t, now); got != c.want {
			t.Errorf("%s: got %d want %d", c.name, got, c.want)
		}
	}
}
