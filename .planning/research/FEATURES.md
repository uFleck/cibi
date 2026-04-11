# Feature Landscape: Recurring Transaction Engine & Financial Decision Logic

**Domain:** Personal finance decision engine (CIBI — "Can I Buy It?")
**Researched:** 2026-04-11
**Scope:** Recurring transaction representation, next-occurrence calculation, payday detection, safety buffer, Go date libraries

---

## Decision Summary (Read This First)

| Decision | Recommendation |
|----------|---------------|
| Recurrence format | Custom 4-value enum, NOT RRULE strings |
| Next-occurrence calculation | Pure Go stdlib (`time.AddDate`, `time.Add`) with a month-end clamp helper |
| Go recurrence library | None needed — roll a 60-line internal package |
| Payday model | `frequency` + `anchor_date` stored in a `PaySchedule` entity |
| Safety buffer | Fixed absolute amount only (v1); extend to percentage in v2 |
| Weekend adjustment | Do not auto-adjust — store canonical day, display note to user |

---

## 1. RRULE: Is It Worth It?

### What RRULE Is

RFC 5545 RRULE is the iCalendar recurrence rule format. A monthly-on-the-15th rule looks like `RRULE:FREQ=MONTHLY;BYMONTHDAY=15`. It handles every possible calendar recurrence: "third Thursday of the month," "every leap year," "weekdays only." It was designed for calendar event scheduling, not financial transaction tracking.

### Why RRULE Is Overkill for CIBI

CIBI needs exactly four frequencies: weekly, bi-weekly (every 14 days), monthly (same calendar day), and yearly (same calendar day, same month). None of CIBI's use cases require the advanced RRULE clauses (`BYMONTH`, `BYDAY`, `BYSETPOS`, `EXDATE`, `RDATE`, etc.). Parsing and storing RRULE strings adds complexity with zero user-facing benefit.

The only meaningful RRULE capability CIBI needs is `After(date)` — "what is the next occurrence after today?" That is a 10-line function for four fixed frequencies.

**Maintainability cost of RRULE strings:** Any developer reading `RRULE:FREQ=WEEKLY;INTERVAL=2` in a SQLite row must know the RFC. A column with value `bi-weekly` and a separate `anchor_date` column is immediately readable.

### Available Go Libraries (for reference, not recommended)

| Library | Stars | Last active | Status |
|---------|-------|-------------|--------|
| `teambition/rrule-go` | ~370 | 2023 | Low maintenance, partial port of python-dateutil |
| `stephens2424/rrule` | Low | Stale | Unmaintained |
| `matthewmueller/rrule` | Low | Stale | Unmaintained |

Confidence: MEDIUM (GitHub stars verified via web search; `teambition/rrule-go` confirmed as most active via pkg.go.dev).

### Recommendation: Custom Enum + Anchor Date

Store recurrence as a Go `string` column with a constrained set of values and validate at the service layer:

```
frequency:   "weekly" | "bi-weekly" | "monthly" | "yearly"
anchor_date: DATE  -- the canonical day of the recurrence (e.g., 2024-03-15 = 15th of each month)
```

Next-occurrence logic is a pure function: `NextAfter(freq, anchor, from time.Time) time.Time`. No external dependency required.

---

## 2. Go Date/Time Arithmetic for Recurring Finance

### Standard Library Coverage

Go's `time` package (`time.AddDate`, `time.Add`) covers all four frequencies:

| Frequency | Calculation |
|-----------|-------------|
| `weekly` | `anchor.Add(7 * 24 * time.Hour)` × N forward until after `from` |
| `bi-weekly` | `anchor.Add(14 * 24 * time.Hour)` × N — mathematically stable, weekday-preserving |
| `monthly` | `anchor.AddDate(0, N, 0)` — requires month-end clamping (see pitfall below) |
| `yearly` | `anchor.AddDate(N, 0, 0)` — straightforward |

Confidence: HIGH (official Go docs, verified behavior via Go issues tracker).

### Critical Pitfall: `time.AddDate` Month Overflow

**This is a known Go stdlib bug/design decision with open issues since 2017 (golang/go#52775, #57139, #10401).**

`time.AddDate(0, 1, 0)` on January 31 returns March 3 (February has no 31st, so Go normalizes by adding the overflow days). For billing, the expected result is February 28 (last day of the month).

**Workaround — month-end clamp function (implement this in the domain layer):**

```go
// AddMonthClamped adds n months to t, clamping to the last day of the
// target month instead of overflowing into the next month.
func AddMonthClamped(t time.Time, n int) time.Time {
    // Advance to first of target month, then restore original day clamped.
    target := time.Date(t.Year(), t.Month()+time.Month(n), 1, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
    // Last day of target month:
    lastDay := time.Date(target.Year(), target.Month()+1, 0, 0, 0, 0, 0, target.Location()).Day()
    day := t.Day()
    if day > lastDay {
        day = lastDay
    }
    return time.Date(target.Year(), target.Month(), day, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
}
```

This must be used instead of bare `AddDate` for all monthly/yearly recurring transaction calculations.

### No External Library Needed

The four-frequency model fits in ~60 lines of internal Go code. Adding a dependency like `teambition/rrule-go` (low maintenance, 370 stars) for this is not worth the transitive complexity.

---

## 3. "Available to Spend" — How Other Apps Do It and What Edge Cases Matter

### PocketGuard's "In My Pocket" Formula

`In My Pocket = Estimated income - Upcoming bills - Goals - Budgets`

PocketGuard resets this calculation on the 1st of each month. The relevant insight for CIBI: **they tie the calculation window to income cadence**, not the calendar month. CIBI's formula is more precise: the window is `now → next_payday`, not `now → end of month`.

Confidence: MEDIUM (from PocketGuard's own help documentation).

### Non-Obvious Edge Cases

These are the edge cases that catch finance app developers off-guard:

#### 3.1 Transactions That Land on Weekends or Holidays

When a monthly bill (e.g., rent on the 1st) falls on a Saturday, some banks debit Friday, some debit Monday. There is no universal rule. The finance industry uses several conventions ("Following," "Modified Following," "Previous Business Day") but there is no standard for consumer apps.

**CIBI decision:** Do not auto-adjust. Store the canonical calendar day (the 1st). If the 1st falls on a weekend, the transaction is still "upcoming" in the calculation. Display a soft warning in the UI ("Note: falls on a weekend — actual debit may differ by 1-2 days") rather than silently shifting the date.

Rationale: Silent shifting creates confusion when the app's projection doesn't match reality. The user's bank behavior is unknowable without bank-specific rules.

#### 3.2 "Double Month" Problem for Bi-Weekly Paychecks

Most years have 26 bi-weekly pay periods. In some years, a given month has 3 paychecks instead of the usual 2. CIBI's `now → next_payday` window naturally handles this because it only ever looks at the next single paycheck, not a monthly total.

**No special handling needed** — the anchor-date model produces correct next-occurrence dates automatically.

#### 3.3 Transactions Already Collected This Cycle

A recurring transaction with `next_occurrence` in the past means it was already debited. The decision engine must only sum transactions where `next_occurrence` is strictly between `now` and `next_payday` (exclusive). After payment, `next_occurrence` should be advanced to the next cycle.

**CIBI decision:** `next_occurrence` is the source of truth. After every debit, the service layer advances `next_occurrence` by one period. The query for the decision engine is `WHERE next_occurrence > now AND next_occurrence <= next_payday`.

#### 3.4 Partial Months at Pay Period Edges

If a user is paid on the 15th and the 1st, and they query CIBI on the 14th, a monthly bill due on the 2nd should NOT be in scope — the next payday (15th) comes before the 2nd. The window check `next_occurrence <= next_payday` handles this correctly without any special case code.

#### 3.5 Yearly Transactions

Annual subscriptions (e.g., Amazon Prime in April) are easy to forget. They should appear in the decision calculation if their `next_occurrence` falls before `next_payday`. For most queries, yearly items won't be in scope — but when they are, they will be correctly included because the engine treats all frequencies identically via the `next_occurrence` field.

---

## 4. Payday Detection — Configuration and Storage Model

### The Three Payday Patterns in Real Life

| Pattern | Example | How it works |
|---------|---------|-------------|
| Fixed day of month | 25th of every month | One integer: `day_of_month = 25` |
| Semi-monthly | 1st and 15th | Two integers: `[1, 15]` |
| Bi-weekly (most common in US) | Every other Friday from an anchor | `frequency = bi-weekly` + `anchor_date` |
| Weekly | Every Friday | `frequency = weekly` + `anchor_date` |

### Recommended Schema: `PaySchedule` Entity

Store as a dedicated row, not embedded in Account. CIBI serves two users (household), and each may have different pay schedules.

```
PaySchedule
  id            UUID
  account_id    UUID (FK)
  frequency     ENUM: "weekly" | "bi-weekly" | "semi-monthly" | "monthly"
  anchor_date   DATE    -- For bi-weekly/weekly: the last known payday.
                        -- For monthly: day_of_month stored as the day field (e.g., 2024-01-25 → day 25).
  day_of_month2 INT?    -- Only for semi-monthly (second day, e.g., 15 when first is 1).
  label         TEXT?   -- e.g., "Main job", "Freelance"
```

### Next Payday Calculation

```go
func NextPayday(schedule PaySchedule, from time.Time) time.Time {
    switch schedule.Frequency {
    case "weekly":
        return nextIntervalAfter(schedule.AnchorDate, 7, from)
    case "bi-weekly":
        return nextIntervalAfter(schedule.AnchorDate, 14, from)
    case "monthly":
        return nextMonthlyDayAfter(schedule.AnchorDate.Day(), from)
    case "semi-monthly":
        return nextSemiMonthlyAfter(schedule.AnchorDate.Day(), schedule.DayOfMonth2, from)
    }
}

// nextIntervalAfter: advance anchor by N days until result > from
func nextIntervalAfter(anchor time.Time, days int, from time.Time) time.Time {
    // Find offset from anchor in complete N-day periods, then advance one more
    diff := from.Sub(anchor)
    periods := int(diff.Hours() / float64(24*days))
    next := anchor.Add(time.Duration(periods+1) * time.Duration(days) * 24 * time.Hour)
    if !next.After(from) {
        next = next.Add(time.Duration(days) * 24 * time.Hour)
    }
    return next
}
```

Bi-weekly is interval-stable (14 days exactly) so simple day-addition preserves the day-of-week correctly. Monthly requires the `AddMonthClamped` helper described in section 2.

### Why Store an Anchor Date (Not Just Frequency + Day-of-Week)

Bi-weekly schedules have two possible sets of "every-other-Friday" — if you only store "bi-weekly on Friday," you don't know which of the two alternating sets is yours. The anchor date pins the sequence: every 14 days from this known-good payday, forever.

---

## 5. Safety Buffer — Design Decision

### Options Considered

| Approach | How it works | Pros | Cons |
|----------|-------------|------|------|
| Fixed absolute amount | User sets `$200` as minimum | Dead simple, predictable | Doesn't scale with income changes |
| Percentage of income | User sets `10%` of paycheck | Scales automatically | Requires knowing income amount; varies per paycheck |
| Dynamic (3-6 months expenses) | System calculates from spending history | Comprehensive | Requires significant transaction history; complex to explain |

### Recommendation: Fixed Absolute Amount (v1), Optional Percentage (v2)

For CIBI's use case — a personal tool for daily purchase decisions — the safety buffer is a **gut-feel constant**, not a calculated value. The user already knows "I want to always keep $300 in my account." They don't want to configure income percentages.

**v1 schema (already in CIBI_SPEC.md):**
```
SafetyBuffer
  min_threshold   DECIMAL  -- e.g., 300.00
```

This is correct. Keep it. The buffer appears in the decision engine as:

```
purchasing_power = current_balance - sum(upcoming_obligations) - min_threshold
can_buy = purchasing_power >= item_price
```

**v2 consideration:** Add an optional `percentage_of_income` field alongside `min_threshold`. Use whichever is larger (conservative approach). This is a V2 concern — do not implement in phase 1.

**Risk level output:** The spec mentions a `risk_level` output. A simple tiered approach based on remaining buffer post-purchase:

```
remaining = purchasing_power - item_price

if remaining >= min_threshold * 1.5:  risk = "LOW"
if remaining >= min_threshold:        risk = "MEDIUM"
if remaining >= 0:                    risk = "HIGH"
if remaining < 0:                     risk = "BLOCKED"
```

This gives meaningful output without requiring dynamic buffer calculation.

---

## 6. Feature Dependencies

```
SafetyBuffer config  →  Decision Engine (engine needs buffer value)
PaySchedule entity   →  Decision Engine (engine needs next_payday date)
RecurringTransaction →  Decision Engine (engine sums upcoming obligations)
  (with next_occurrence)

RecurringTransaction.advance() must be called after each debit
  (next_occurrence = NextAfter(frequency, anchor, next_occurrence))

AddMonthClamped()    →  all monthly/yearly next_occurrence calculations
```

---

## 7. Table Stakes vs. Differentiators

### Table Stakes (must have for CIBI to be useful)

| Feature | Why Expected | Complexity |
|---------|-------------|------------|
| 4 recurrence frequencies (weekly, bi-weekly, monthly, yearly) | Core requirement from spec | Low |
| `next_occurrence` tracking with auto-advance after debit | Without this, obligations are double-counted or missed | Medium |
| Configurable payday (bi-weekly anchor + frequency) | Without correct payday, the window is wrong | Medium |
| Fixed safety buffer | Core formula component | Low |
| Decision engine: can/cannot + remaining buffer + risk level | The entire product value | Medium |
| Correct month-end clamping for monthly transactions | Without this, "bill on the 31st" silently breaks in Feb | Low (once written) |

### Differentiators (CIBI-specific, not standard in other apps)

| Feature | Value | Complexity |
|---------|-------|------------|
| `now → next_payday` window (not monthly reset) | More accurate than PocketGuard's monthly-reset model | Low (correct query) |
| MCP tool exposure for Claude | Conversational financial queries | Medium |
| Sub-100ms response | Instant UX feedback | Low (SQLite is fast enough) |

### Anti-Features (explicitly do not build)

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Full RRULE string storage | Overkill complexity, low library quality in Go | Custom 4-value enum + anchor_date |
| Automatic weekend/holiday date shifting | Unknowable without bank-specific rules; causes confusion | Store canonical day, show UI note |
| Dynamic safety buffer calculation | Requires transaction history CIBI doesn't have at launch | Fixed absolute amount |
| Automatic transaction detection / bank sync | Out of scope (privacy-first) | Manual entry only |
| Monthly budget resets | Wrong mental model for CIBI's "until next payday" focus | Payday-window model |

---

## 8. Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Monthly recurring calculation | `time.AddDate` month overflow bug | Implement `AddMonthClamped` before any monthly transaction tests |
| Decision engine query | Off-by-one on `next_occurrence <= next_payday` boundary | Test with transaction due exactly ON payday (include it — it comes out before next paycheck arrives) |
| Bi-weekly payday calculation | Which of the two alternating Friday sets is correct | Always derive from anchor date, never from "weekday + every-other" |
| `next_occurrence` advancement | Forgetting to advance after a debit triggers double-counting | Advance in service layer as atomic operation with debit recording |
| Safety buffer UX | User sets buffer to 0 (valid) — engine must not reject 0 | Allow 0 as valid value; it disables the buffer concept |
| Semi-monthly payday (1st + 15th) | Queries must find the nearest of the two upcoming dates | Return `min(next(day1), next(day2))` from NextPayday function |

---

## Sources

- PocketGuard "In My Pocket" documentation: https://help.pocketguard.com/hc/en-us/articles/360002167320-IN-MY-POCKET
- Go `time.AddDate` month overflow issues: https://github.com/golang/go/issues/52775 and https://github.com/golang/go/issues/57139
- `teambition/rrule-go` package: https://pkg.go.dev/github.com/teambition/rrule-go
- Bi-weekly payday formula explanation: https://exceljet.net/formulas/next-biweekly-payday-from-date
- Date rolling conventions (finance): https://en.wikipedia.org/wiki/Date_rolling
- Go production month calculation bug: https://dev.to/nordcloud/how-a-calculation-of-previous-month-in-golang-can-break-production-1ppi
- Go `rickar/cal` (business days): https://github.com/rickar/cal
