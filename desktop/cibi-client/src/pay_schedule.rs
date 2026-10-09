use crate::models::PayScheduleResponse;
use chrono::{DateTime, Datelike, Duration, Months, NaiveDate, Utc};

pub fn day_start(d: NaiveDate) -> DateTime<Utc> {
    d.and_hms_opt(0, 0, 0).unwrap().and_utc()
}

/// First 10 chars as a UTC date (`2026-04-20` or `2026-04-20T...`).
pub fn parse_date_only_utc(s: &str) -> Option<DateTime<Utc>> {
    NaiveDate::parse_from_str(s.get(..10)?, "%Y-%m-%d").ok().map(day_start)
}

/// RFC3339 or date-only, like JS `new Date(str)`.
pub fn parse_ts(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s).map(|d| d.with_timezone(&Utc)).ok().or_else(|| parse_date_only_utc(s))
}

fn clamped_day(y: i32, m0: u32, day: u32) -> DateTime<Utc> {
    let first = NaiveDate::from_ymd_opt(y, m0 + 1, 1).unwrap();
    let last = first.checked_add_months(Months::new(1)).unwrap().pred_opt().unwrap().day();
    day_start(first.with_day(day.clamp(1, last)).unwrap())
}

fn next_fixed(anchor: DateTime<Utc>, from: DateTime<Utc>, interval: i64) -> DateTime<Utc> {
    let mut c = anchor;
    if from >= anchor {
        let elapsed = (from - anchor).num_days() / interval;
        c = anchor + Duration::days((elapsed + 1) * interval);
    }
    while c <= from {
        c += Duration::days(interval);
    }
    c
}

fn next_monthly(anchor: DateTime<Utc>, from: DateTime<Utc>) -> DateTime<Utc> {
    let (mut y, mut m) = (from.year(), from.month0());
    let mut c = clamped_day(y, m, anchor.day());
    while c <= from {
        m += 1;
        if m > 11 {
            m = 0;
            y += 1;
        }
        c = clamped_day(y, m, anchor.day());
    }
    c
}

fn next_day_of_month(day: u32, from: DateTime<Utc>) -> DateTime<Utc> {
    let this = clamped_day(from.year(), from.month0(), day);
    if this > from {
        return this;
    }
    let (y, m) = if from.month0() == 11 { (from.year() + 1, 0) } else { (from.year(), from.month0() + 1) };
    clamped_day(y, m, day)
}

/// First payday strictly after `from`. None if the anchor date is unparseable.
pub fn next_payday_after(s: &PayScheduleResponse, from: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let anchor = parse_date_only_utc(&s.anchor_date)?;
    // Monthly helpers ignore the anchor's year/month; never return an occurrence before the anchor.
    let cf = if anchor > from { anchor - Duration::milliseconds(1) } else { from };
    Some(match s.frequency.as_str() {
        "weekly" => next_fixed(anchor, from, 7),
        "bi-weekly" => next_fixed(anchor, from, 14),
        "semi-monthly" => {
            let n1 = next_day_of_month(anchor.day(), cf);
            match s.day_of_month_2 {
                Some(d2) if d2 > 0 => n1.min(next_day_of_month(d2 as u32, cf)),
                _ => n1,
            }
        }
        _ => next_monthly(anchor, cf),
    })
}

pub fn earliest_payday_after(schedules: &[PayScheduleResponse], from: DateTime<Utc>) -> Option<DateTime<Utc>> {
    schedules.iter().filter_map(|s| next_payday_after(s, from)).min()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sch(anchor: &str, freq: &str, d2: Option<i64>) -> PayScheduleResponse {
        PayScheduleResponse { anchor_date: anchor.into(), frequency: freq.into(), day_of_month_2: d2, ..Default::default() }
    }
    fn ts(s: &str) -> DateTime<Utc> {
        parse_ts(s).unwrap()
    }

    #[test]
    fn paydays() {
        let from = ts("2026-09-09T12:00:00Z");
        assert_eq!(next_payday_after(&sch("2026-09-01", "weekly", None), from), Some(ts("2026-09-15")));
        assert_eq!(next_payday_after(&sch("2026-09-01", "bi-weekly", None), from), Some(ts("2026-09-15")));
        assert_eq!(next_payday_after(&sch("2026-01-31", "monthly", None), ts("2026-02-01")), Some(ts("2026-02-28")));
        // anchor in the future: not before anchor
        assert_eq!(next_payday_after(&sch("2026-10-20", "monthly", None), from), Some(ts("2026-10-20")));
        let semi = sch("2026-09-05", "semi-monthly", Some(20));
        assert_eq!(next_payday_after(&semi, from), Some(ts("2026-09-20")));
        assert_eq!(next_payday_after(&semi, ts("2026-09-21")), Some(ts("2026-10-05")));
        assert_eq!(next_payday_after(&sch("2026-12-15", "monthly", None), ts("2026-12-20")), Some(ts("2027-01-15")));
        assert_eq!(next_payday_after(&sch("junk", "monthly", None), from), None);
    }
}
