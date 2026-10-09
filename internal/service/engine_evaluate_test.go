package service

import (
	"testing"
	"time"
)

func TestEvaluate(t *testing.T) {
	payday := time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)
	// balance 50000, obligations -20000, buffer 10000 → purchasing power 20000.
	in := engineInputs{balance: 50000, obligations: -20000, safetyBuffer: 10000, paydayAmount: 30000, earliestPayday: payday}

	tests := []struct {
		name    string
		in      engineInputs
		price   int64
		canBuy  bool
		risk    RiskLevel
		waitEnd bool
	}{
		{"can buy, low risk", in, 5000, true, RiskLow, false},
		{"can buy, high risk", in, 19000, true, RiskHigh, false},
		{"blocked", in, 60000, false, RiskBlocked, false},
		{"wait for payday", in, 30000, false, RiskWait, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := evaluate(tc.in, tc.price)
			if got.CanBuy != tc.canBuy || got.RiskLevel != tc.risk || (got.WaitUntil != nil) != tc.waitEnd {
				t.Fatalf("got %+v", got)
			}
			if got.PurchasingPower != 20000 || got.BufferRemaining != 20000-tc.price {
				t.Fatalf("bad amounts: %+v", got)
			}
		})
	}
}
