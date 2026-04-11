---
plan: "02-01"
title: "Engine Package — Date Math & PaySchedule Logic"
phase: 2
wave: 1
depends_on: []
files_modified:
  - internal/engine/engine.go
  - internal/engine/engine_test.go
autonomous: true
requirements:
  - ENGINE-01
  - ENGINE-02
must_haves:
  - AddMonthClamped correctly clamps Jan 31 + 1 month to Feb 28 (non-leap) and Feb 29 (leap)
  - NextPayday returns a date strictly after `from` for all four schedule frequencies
  - All time values use time.UTC throughout
---

# Plan 02-01: Engine Package — Date Math & PaySchedule Logic

## Goal

Create `internal/engine/engine.go` with pure calculation functions:
- `AddMonthClamped` — month-end safe date advancement
- `NextPayday` — next pay date strictly after a given time for all four schedule types

These functions have zero dependencies on the database or any service. They are purely mathematical and must be fully covered by table-driven unit tests.

---

## Wave 1

### Task 02-01-01: Create `internal/engine/engine.go`

<read_first>
- `internal/migrations/20260411000001_initial_schema.go` — confirm PaySchedule schema columns: frequency TEXT, anchor_date TEXT, day_of_month2 INTEGER nullable
- `.planning/REQUIREMENTS.md` — ENGINE-01 and ENGINE-02 exact spec
- `.planning/phases/02-domain-engine/02-CONTEXT.md` — D-01 (strict UTC), D-04 (PaySchedule in accounts)
- `.planning/phases/02-domain-engine/02-RESEARCH.md` — Section 1 (AddMonthClamped algorithm) and Section 2 (NextPayday per frequency)
</read_first>

<action>
Create `internal/engine/engine.go` with package `engine` and the following exact content:

```go
package engine

import "time"

// Frequency constants matching the schema TEXT enum values.
const (
	FreqWeekly      = "weekly"
	FreqBiWeekly    = "bi-weekly"
	FreqSemiMonthly = "semi-monthly"
	FreqMonthly     = "monthly"
	FreqYearly      = "yearly"
)

// PaySchedule mirrors the PaySchedule schema row (IDs omitted — pure logic).
type PaySchedule struct {
	Frequency   string    // "weekly" | "bi-weekly" | "semi-monthly" | "monthly"
	AnchorDate  time.Time // UTC anchor for interval calculation
	DayOfMonth2 *int      // only for semi-monthly: second pay day of month
}

// AddMonthClamped advances t by n months, clamping to the last valid day of
// the target month when the day would overflow into the next month.
//
// Examples:
//   - Jan 31 + 1 = Feb 28 (non-leap)  [not Mar 2]
//   - Jan 31 + 1 = Feb 29 (leap year) [not Mar 1]
//   - Mar 31 + 1 = Apr 30             [not May 1]
//   - Dec 31 + 1 = Jan 31             [no overflow]
func AddMonthClamped(t time.Time, n int) time.Time {
	result := t.AddDate(0, n, 0)
	// If the day changed, AddDate overflowed into the next month.
	// Subtract the overflow days to land on the last day of the intended month.
	if result.Day() != t.Day() {
		result = result.AddDate(0, 0, -result.Day())
	}
	return result
}

// NextPayday returns the next pay date strictly after `from` based on the
// given PaySchedule.
//
// All calculations are performed in UTC.
func NextPayday(schedule PaySchedule, from time.Time) time.Time {
	from = from.UTC()
	anchor := schedule.AnchorDate.UTC()

	switch schedule.Frequency {
	case FreqWeekly:
		return nextFixedInterval(anchor, from, 7)

	case FreqBiWeekly:
		return nextFixedInterval(anchor, from, 14)

	case FreqMonthly:
		return nextMonthly(anchor, from)

	case FreqSemiMonthly:
		day2 := 0
		if schedule.DayOfMonth2 != nil {
			day2 = *schedule.DayOfMonth2
		}
		return nextSemiMonthly(anchor.Day(), day2, from)

	default:
		// Fallback: treat as monthly
		return nextMonthly(anchor, from)
	}
}

// nextFixedInterval returns the next date strictly after `from` that is
// exactly intervalDays after anchor (or a multiple thereof).
func nextFixedInterval(anchor, from time.Time, intervalDays int) time.Time {
	// Compute whole intervals elapsed since anchor (floor division).
	diff := int(from.Sub(anchor) / (24 * time.Hour))
	if diff < 0 {
		diff = 0
	}
	elapsed := diff / intervalDays
	// Next occurrence is elapsed+1 intervals from anchor.
	next := anchor.AddDate(0, 0, (elapsed+1)*intervalDays)
	// Safety: ensure strictly after from (handles anchor == from exactly).
	for !next.After(from) {
		next = next.AddDate(0, 0, intervalDays)
	}
	return next
}

// nextMonthly returns the next monthly pay date strictly after `from`,
// using AddMonthClamped to handle month-end anchor days.
func nextMonthly(anchor, from time.Time) time.Time {
	// Start from anchor month in `from`'s year/month.
	candidate := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, time.UTC)
	candidate = time.Date(candidate.Year(), candidate.Month(), anchor.Day(), 0, 0, 0, 0, time.UTC)
	// Clamp to last day of month if anchor day > days in that month.
	if candidate.Month() != time.Date(from.Year(), from.Month(), anchor.Day(), 0, 0, 0, 0, time.UTC).Month() {
		// Overflowed — go back to last day of target month.
		candidate = time.Date(from.Year(), from.Month()+1, 0, 0, 0, 0, 0, time.UTC)
	}
	// Advance until strictly after `from`.
	for !candidate.After(from) {
		candidate = AddMonthClamped(candidate, 1)
	}
	return candidate
}

// nextSemiMonthly returns the next semi-monthly pay date strictly after `from`.
// day1 is derived from anchor.Day(), day2 from DayOfMonth2.
// Returns min(next occurrence of day1, next occurrence of day2).
func nextSemiMonthly(day1, day2 int, from time.Time) time.Time {
	next1 := nextDayOfMonth(day1, from)
	if day2 <= 0 {
		return next1
	}
	next2 := nextDayOfMonth(day2, from)
	if next1.Before(next2) {
		return next1
	}
	return next2
}

// nextDayOfMonth returns the next occurrence of dayNum (1-31) strictly after
// `from`, clamped to the last valid day of each candidate month.
func nextDayOfMonth(dayNum int, from time.Time) time.Time {
	// Try this month first.
	candidate := clampedDayInMonth(from.Year(), from.Month(), dayNum)
	if candidate.After(from) {
		return candidate
	}
	// Try next month.
	nextMonth := from.Month() + 1
	nextYear := from.Year()
	if nextMonth > 12 {
		nextMonth = 1
		nextYear++
	}
	return clampedDayInMonth(nextYear, nextMonth, dayNum)
}

// clampedDayInMonth returns time.Date for year/month/day, clamping day to the
// last valid day of the month if it exceeds the month's length.
func clampedDayInMonth(year int, month time.Month, day int) time.Time {
	// First day of next month minus 1 day = last day of target month.
	lastDay := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}
```
</action>

<acceptance_criteria>
- `internal/engine/engine.go` exists and contains `func AddMonthClamped(t time.Time, n int) time.Time`
- `internal/engine/engine.go` contains `func NextPayday(schedule PaySchedule, from time.Time) time.Time`
- `internal/engine/engine.go` contains `type PaySchedule struct`
- `internal/engine/engine.go` contains constants `FreqWeekly`, `FreqBiWeekly`, `FreqSemiMonthly`, `FreqMonthly`
- `grep -r "time.UTC" internal/engine/engine.go` returns matches (UTC enforced)
- `go build ./internal/engine/...` exits 0
</acceptance_criteria>

---

### Task 02-01-02: Create `internal/engine/engine_test.go`

<read_first>
- `internal/engine/engine.go` — the functions being tested (read AFTER creating it)
- `.planning/phases/02-domain-engine/02-RESEARCH.md` — Section 7 (Testing Strategy, exact test cases)
</read_first>

<action>
Create `internal/engine/engine_test.go` with package `engine` and full table-driven tests:

```go
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
```
</action>

<acceptance_criteria>
- `internal/engine/engine_test.go` exists and contains `func TestAddMonthClamped`
- `internal/engine/engine_test.go` contains `func TestNextPayday_BiWeekly`
- `internal/engine/engine_test.go` contains `func TestNextPayday_Monthly`
- `internal/engine/engine_test.go` contains `func TestNextPayday_SemiMonthly`
- `go test ./internal/engine/... -v` exits 0 with all tests passing
- Output includes `PASS` for `TestAddMonthClamped/jan31+1=feb28_nonleap`
- Output includes `PASS` for `TestAddMonthClamped/jan31+1=feb29_leap`
</acceptance_criteria>

---

## Verification

```bash
go test ./internal/engine/... -v -run "TestAddMonthClamped|TestNextPayday"
```

Expected: all subtests PASS, exit 0.

**must_haves:**
- [ ] `AddMonthClamped` Jan 31 (non-leap) → Feb 28
- [ ] `AddMonthClamped` Jan 31 (leap 2024) → Feb 29
- [ ] `NextPayday` bi-weekly returns correct alternating dates from anchor
- [ ] All tests exit 0
