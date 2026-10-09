use crate::models::*;
use crate::pay_schedule::{next_payday_after, parse_ts};
use chrono::{DateTime, Datelike, Months, NaiveDate, Utc};

#[derive(Debug, Clone, PartialEq)]
pub struct MonthlyProjection {
    pub month_start: DateTime<Utc>,
    pub month_end: DateTime<Utc>,
    pub income: f64,
    pub recurring_obligations: f64,
    pub installment_obligations: f64,
    pub peer_obligations: f64,
    pub total_obligations: f64,
    pub net: f64,
    pub projected_end_balance: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CustomProjection {
    pub window_start: DateTime<Utc>,
    pub window_end: DateTime<Utc>,
    pub income: f64,
    pub obligations: f64,
    pub net: f64,
    pub projected_end_balance: f64,
}

pub(crate) fn in_range(occurrence: &str, start: DateTime<Utc>, end: DateTime<Utc>) -> bool {
    parse_ts(occurrence).is_some_and(|d| d >= start && d < end)
}

/// Sum of pay schedule amounts landing in [start, end).
pub(crate) fn income_between(schedules: &[PayScheduleResponse], start: DateTime<Utc>, end: DateTime<Utc>) -> f64 {
    let mut income = 0.0;
    for s in schedules {
        // ponytail: 52-occurrence cap per schedule (a year of weekly paydays), like the web.
        let mut occ = next_payday_after(s, start - chrono::Duration::milliseconds(1));
        for _ in 0..52 {
            match occ {
                Some(o) if o < end => {
                    income += s.amount;
                    occ = next_payday_after(s, o);
                }
                _ => break,
            }
        }
    }
    income
}

/// (recurring, installment, peer) obligations due in [start, end).
fn obligations_between(
    txns: &[TransactionResponse],
    breakdown: &[FriendDebtBreakdownItem],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> (f64, f64, f64) {
    let due = |t: &TransactionResponse| t.next_occurrence.as_deref().is_some_and(|o| in_range(o, start, end));
    let recurring = txns.iter().filter(|t| t.is_recurring && !t.is_installment && due(t)).map(|t| t.amount.abs()).sum();
    let installment = txns.iter().filter(|t| t.is_installment && t.amount < 0.0 && due(t)).map(|t| t.amount.abs()).sum();
    let peer = breakdown
        .iter()
        .filter(|d| d.next_payment_date.as_deref().is_some_and(|o| in_range(o, start, end)))
        .map(|d| d.next_payment)
        .sum();
    (recurring, installment, peer)
}

pub fn compute_monthly_projection(
    account: &AccountResponse,
    txns: &[TransactionResponse],
    schedules: &[PayScheduleResponse],
    breakdown: &[FriendDebtBreakdownItem],
    now: DateTime<Utc>,
) -> MonthlyProjection {
    let first = NaiveDate::from_ymd_opt(now.year(), now.month(), 1).unwrap();
    let month_start = first.and_hms_opt(0, 0, 0).unwrap().and_utc();
    let month_end = (first + Months::new(1)).and_hms_opt(0, 0, 0).unwrap().and_utc();
    let income = income_between(schedules, month_start, month_end);
    let (r, i, p) = obligations_between(txns, breakdown, month_start, month_end);
    let total = r + i + p;
    MonthlyProjection {
        month_start,
        month_end,
        income,
        recurring_obligations: r,
        installment_obligations: i,
        peer_obligations: p,
        total_obligations: total,
        net: income - total,
        projected_end_balance: account.current_balance + income - total,
    }
}

/// Window is clipped to start no earlier than `now`; `exclude_balance` starts from 0 instead of the balance.
pub fn compute_custom_projection(
    account: &AccountResponse,
    txns: &[TransactionResponse],
    schedules: &[PayScheduleResponse],
    breakdown: &[FriendDebtBreakdownItem],
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
    exclude_balance: bool,
    now: DateTime<Utc>,
) -> CustomProjection {
    let start = now.max(window_start);
    let income = income_between(schedules, start, window_end);
    let (r, i, p) = obligations_between(txns, breakdown, start, window_end);
    let obligations = r + i + p;
    let net = income - obligations;
    CustomProjection {
        window_start,
        window_end,
        income,
        obligations,
        net,
        projected_end_balance: if exclude_balance { 0.0 } else { account.current_balance } + net,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acct(b: f64) -> AccountResponse {
        AccountResponse { current_balance: b, ..Default::default() }
    }
    fn sched(anchor: &str, amount: f64, freq: &str) -> PayScheduleResponse {
        PayScheduleResponse { anchor_date: anchor.into(), next_payday: anchor.into(), amount, frequency: freq.into(), ..Default::default() }
    }
    fn txn(amount: f64, next: &str, recurring: bool, installment: bool) -> TransactionResponse {
        TransactionResponse { amount, next_occurrence: Some(next.into()), is_recurring: recurring, is_installment: installment, ..Default::default() }
    }
    fn debt(p: f64, date: &str) -> FriendDebtBreakdownItem {
        FriendDebtBreakdownItem { next_payment: p, total_amount: p, next_payment_date: Some(date.into()), ..Default::default() }
    }
    fn sep9() -> DateTime<Utc> {
        parse_ts("2026-09-09T12:00:00Z").unwrap()
    }
    fn proj(a: f64, t: &[TransactionResponse], s: &[PayScheduleResponse], d: &[FriendDebtBreakdownItem]) -> MonthlyProjection {
        compute_monthly_projection(&acct(a), t, s, d, sep9())
    }

    #[test]
    fn income() {
        assert_eq!(proj(0.0, &[], &[sched("2026-09-15", 5000.0, "monthly")], &[]).income, 5000.0);
        // monthEnd boundary exclusive: Sep 30 counted, Oct 30 not
        assert_eq!(proj(0.0, &[], &[sched("2026-09-30", 5000.0, "monthly")], &[]).income, 5000.0);
        // weekly Sep 1,8,15,22,29
        assert_eq!(proj(0.0, &[], &[sched("2026-09-01", 1000.0, "weekly")], &[]).income, 5000.0);
    }

    #[test]
    fn obligations() {
        assert_eq!(proj(0.0, &[txn(-800.0, "2026-09-20T00:00:00Z", true, false)], &[], &[]).recurring_obligations, 800.0);
        assert_eq!(proj(0.0, &[txn(-800.0, "2026-10-01T00:00:00Z", true, false)], &[], &[]).recurring_obligations, 0.0);
        assert_eq!(proj(0.0, &[txn(-300.0, "2026-09-25T00:00:00Z", false, true)], &[], &[]).installment_obligations, 300.0);
        assert_eq!(proj(0.0, &[], &[], &[debt(500.0, "2026-09-18")]).peer_obligations, 500.0);
        assert_eq!(proj(0.0, &[], &[], &[debt(500.0, "2026-10-10")]).peer_obligations, 0.0);
    }

    #[test]
    fn projected_balance_and_bounds() {
        let p = proj(10000.0, &[txn(-1200.0, "2026-09-20T00:00:00Z", true, false)], &[sched("2026-09-15", 5000.0, "monthly")], &[]);
        assert_eq!(p.projected_end_balance, 13800.0);
        assert_eq!(p.month_start, parse_ts("2026-09-01").unwrap());
        assert_eq!(p.month_end, parse_ts("2026-10-01").unwrap());
    }

    #[test]
    fn custom_clips_to_now() {
        let t = [txn(-100.0, "2026-09-05T00:00:00Z", true, false), txn(-50.0, "2026-09-20T00:00:00Z", true, false)];
        let (s, e) = (parse_ts("2026-09-01").unwrap(), parse_ts("2026-10-01").unwrap());
        let p = compute_custom_projection(&acct(1000.0), &t, &[], &[], s, e, false, sep9());
        assert_eq!((p.obligations, p.projected_end_balance), (50.0, 950.0));
        assert_eq!(compute_custom_projection(&acct(1000.0), &t, &[], &[], s, e, true, sep9()).projected_end_balance, -50.0);
    }
}
