package engine

import "time"

// NextInstallmentDue computes next installment due date from first due date,
// number of already paid installments, and frequency.
func NextInstallmentDue(firstDue time.Time, paidInstallments int64, frequency string) time.Time {
	switch frequency {
	case FreqWeekly:
		return firstDue.AddDate(0, 0, int(paidInstallments)*7)
	default:
		return firstDue.AddDate(0, int(paidInstallments), 0)
	}
}
