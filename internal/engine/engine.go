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
	// If from is before the anchor, the anchor itself is the next occurrence.
	if !from.Before(anchor) {
		// Compute elapsed whole intervals since anchor.
		diff := int(from.Sub(anchor).Hours() / 24)
		elapsed := diff / intervalDays
		// Start at elapsed+1 to get strictly after from.
		anchor = anchor.AddDate(0, 0, (elapsed+1)*intervalDays)
	}
	// Safety: ensure strictly after from (handles boundary exactly).
	for !anchor.After(from) {
		anchor = anchor.AddDate(0, 0, intervalDays)
	}
	return anchor
}

// nextMonthly returns the next monthly pay date strictly after `from`,
// using AddMonthClamped to handle month-end anchor days.
func nextMonthly(anchor, from time.Time) time.Time {
	// Build a canonical monthly reference in the anchor's month of year 1,
	// then advance by months until strictly after from.
	// We start from the anchor, placed at the equivalent month in from's timeframe.
	// clampedDayInMonth gives the correctly clamped date for this month.
	candidate := clampedDayInMonth(from.Year(), from.Month(), anchor.Day())
	// Advance until strictly after `from`, one month at a time.
	for !candidate.After(from) {
		// Use AddMonthClamped on the anchor's day to preserve month-end intent.
		nextYear := candidate.Year()
		nextMonth := candidate.Month() + 1
		if nextMonth > 12 {
			nextMonth = 1
			nextYear++
		}
		candidate = clampedDayInMonth(nextYear, nextMonth, anchor.Day())
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
