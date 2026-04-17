package engine

import (
	"testing"
	"time"
)

func TestNextInstallmentDue_Monthly(t *testing.T) {
	firstDue := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	got := NextInstallmentDue(firstDue, 2, FreqMonthly)
	want := time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestNextInstallmentDue_Weekly(t *testing.T) {
	firstDue := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	got := NextInstallmentDue(firstDue, 3, FreqWeekly)
	want := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestNextInstallmentDue_DefaultsToMonthly(t *testing.T) {
	firstDue := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	got := NextInstallmentDue(firstDue, 1, "unknown")
	want := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}
