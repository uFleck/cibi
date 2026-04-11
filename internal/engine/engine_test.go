package engine

import (
	"testing"
	"time"
)

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func TestAddMonthClamped(t *testing.T) {
	tests := []struct {
		name     string
		input    time.Time
		n        int
		expected time.Time
	}{
		{"jan31+1=feb28_nonleap", date(2025, 1, 31), 1, date(2025, 2, 28)},
		{"jan31+1=feb29_leap", date(2024, 1, 31), 1, date(2024, 2, 29)},
		{"feb29+12=feb28", date(2024, 2, 29), 12, date(2025, 2, 28)},
		{"mar31+1=apr30", date(2025, 3, 31), 1, date(2025, 4, 30)},
		{"dec31+1=jan31", date(2025, 12, 31), 1, date(2026, 1, 31)},
		{"jan15+1=feb15_noclamp", date(2025, 1, 15), 1, date(2025, 2, 15)},
		{"jan31-1=dec31", date(2025, 1, 31), -1, date(2024, 12, 31)},
		{"aug31+1=sep30", date(2025, 8, 31), 1, date(2025, 9, 30)},
		{"jan31+2=mar31_noclamp", date(2025, 1, 31), 2, date(2025, 3, 31)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := AddMonthClamped(tt.input, tt.n)
			if !got.Equal(tt.expected) {
				t.Errorf("AddMonthClamped(%v, %d) = %v; want %v",
					tt.input.Format("2006-01-02"), tt.n,
					got.Format("2006-01-02"), tt.expected.Format("2006-01-02"))
			}
		})
	}
}

func TestNextPayday_BiWeekly(t *testing.T) {
	anchor := date(2025, 1, 3) // A Friday
	sched := PaySchedule{Frequency: FreqBiWeekly, AnchorDate: anchor}

	tests := []struct {
		name     string
		from     time.Time
		expected time.Time
	}{
		{"from_before_first_period", date(2025, 1, 1), date(2025, 1, 3)},
		{"from_on_anchor", date(2025, 1, 3), date(2025, 1, 17)},
		{"from_midway", date(2025, 1, 10), date(2025, 1, 17)},
		{"from_on_second", date(2025, 1, 17), date(2025, 1, 31)},
		{"from_after_several", date(2025, 2, 14), date(2025, 2, 28)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NextPayday(sched, tt.from)
			if !got.Equal(tt.expected) {
				t.Errorf("NextPayday(bi-weekly, %v) = %v; want %v",
					tt.from.Format("2006-01-02"),
					got.Format("2006-01-02"),
					tt.expected.Format("2006-01-02"))
			}
		})
	}
}

func TestNextPayday_Weekly(t *testing.T) {
	anchor := date(2025, 1, 6) // Monday
	sched := PaySchedule{Frequency: FreqWeekly, AnchorDate: anchor}

	tests := []struct {
		name     string
		from     time.Time
		expected time.Time
	}{
		{"from_before_anchor", date(2025, 1, 1), date(2025, 1, 6)},
		{"from_on_anchor", date(2025, 1, 6), date(2025, 1, 13)},
		{"from_midweek", date(2025, 1, 9), date(2025, 1, 13)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NextPayday(sched, tt.from)
			if !got.Equal(tt.expected) {
				t.Errorf("NextPayday(weekly, %v) = %v; want %v",
					tt.from.Format("2006-01-02"),
					got.Format("2006-01-02"),
					tt.expected.Format("2006-01-02"))
			}
		})
	}
}

func TestNextPayday_Monthly(t *testing.T) {
	anchor := date(2025, 1, 31)
	sched := PaySchedule{Frequency: FreqMonthly, AnchorDate: anchor}

	tests := []struct {
		name     string
		from     time.Time
		expected time.Time
	}{
		{"from_jan_31", date(2025, 1, 31), date(2025, 2, 28)},
		{"from_jan_15", date(2025, 1, 15), date(2025, 1, 31)},
		{"from_feb_28", date(2025, 2, 28), date(2025, 3, 31)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NextPayday(sched, tt.from)
			if !got.Equal(tt.expected) {
				t.Errorf("NextPayday(monthly anchor=Jan31, %v) = %v; want %v",
					tt.from.Format("2006-01-02"),
					got.Format("2006-01-02"),
					tt.expected.Format("2006-01-02"))
			}
		})
	}
}

func TestNextPayday_SemiMonthly(t *testing.T) {
	day2 := 30
	sched := PaySchedule{
		Frequency:   FreqSemiMonthly,
		AnchorDate:  date(2025, 1, 15),
		DayOfMonth2: &day2,
	}

	tests := []struct {
		name     string
		from     time.Time
		expected time.Time
	}{
		{"from_jan_1", date(2025, 1, 1), date(2025, 1, 15)},
		{"from_jan_15", date(2025, 1, 15), date(2025, 1, 30)},
		{"from_jan_20", date(2025, 1, 20), date(2025, 1, 30)},
		{"from_jan_30", date(2025, 1, 30), date(2025, 2, 15)},
		// Feb has no day 30 — should clamp to Feb 28
		{"from_feb_15", date(2025, 2, 15), date(2025, 2, 28)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NextPayday(sched, tt.from)
			if !got.Equal(tt.expected) {
				t.Errorf("NextPayday(semi-monthly 15/30, %v) = %v; want %v",
					tt.from.Format("2006-01-02"),
					got.Format("2006-01-02"),
					tt.expected.Format("2006-01-02"))
			}
		})
	}
}
