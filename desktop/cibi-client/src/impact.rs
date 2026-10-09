use crate::format::format_date;
use crate::models::*;
use crate::pay_schedule::{day_start, earliest_payday_after, parse_date_only_utc, parse_ts};
use crate::projection::{in_range, income_between};
use crate::window::is_in_current_pay_window;
use chrono::{Duration, Months, NaiveDate};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImpactSummary {
    pub current_count: usize,
    pub next_count: usize,
    pub current_amount: f64,
    pub next_amount: f64,
    pub current_projected_balance: f64,
    pub next_projected_balance: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Preset {
    CurrentWindow,
    DueNow,
    NextWindow,
    AllRecurring,
    OneTimeOnly,
}

fn nz(o: &Option<String>) -> Option<&str> {
    o.as_deref().filter(|s| !s.is_empty())
}

fn parse_day(v: &str) -> Option<NaiveDate> {
    parse_ts(v).map(|d| d.date_naive())
}

fn pending(t: &TransactionResponse) -> bool {
    t.requires_confirmation && t.confirmed_at.is_none()
}

/// ponytail: monthly shift clamps to month end (JS overflowed Jan 31 + 1mo into March).
fn shift_window(value: &str, frequency: &str) -> Option<NaiveDate> {
    let d = parse_date_only_utc(value)?.date_naive();
    match frequency {
        "weekly" => Some(d + Duration::days(7)),
        "bi-weekly" => Some(d + Duration::days(14)),
        "semi-monthly" => Some(d + Duration::days(15)),
        "monthly" => d.checked_add_months(Months::new(1)),
        _ => None,
    }
}

/// (next payday day, the payday after it) from the earliest `next_payday` schedule.
pub fn get_window_bounds(schedules: &[PayScheduleResponse], next_payday: Option<&str>) -> (Option<NaiveDate>, Option<NaiveDate>) {
    let primary = schedules.iter().min_by(|a, b| a.next_payday.cmp(&b.next_payday));
    (
        next_payday.and_then(parse_day),
        primary.and_then(|p| shift_window(&p.next_payday, &p.frequency)),
    )
}

pub struct WindowLabels {
    pub due_now: String,
    pub current_window: String,
    pub next_window: String,
}

pub fn get_window_labels(next_payday: Option<&str>, schedules: &[PayScheduleResponse]) -> WindowLabels {
    let (next, following) = get_window_bounds(schedules, next_payday);
    let fmt = |d: Option<NaiveDate>| d.map_or("?".to_string(), |d| format_date(&day_start(d).to_rfc3339()));
    let np = fmt(next);
    WindowLabels {
        due_now: format!("Due now (before {np})"),
        current_window: format!("Current (until {np})"),
        next_window: match following {
            Some(_) => format!("Next ({np} – {})", fmt(following)),
            None => "Next window".into(),
        },
    }
}

pub fn is_current_due(t: &TransactionResponse, next_payday: Option<&str>, next_payday_day: Option<NaiveDate>) -> bool {
    if t.is_recurring {
        return nz(&t.next_occurrence).or(nz(&t.anchor_date)).is_some_and(|d| is_in_current_pay_window(d, next_payday));
    }
    if t.is_installment {
        return nz(&t.next_occurrence).is_some_and(|d| is_in_current_pay_window(d, next_payday));
    }
    if !pending(t) {
        return false;
    }
    match parse_day(nz(&t.anchor_date).unwrap_or(&t.timestamp)) {
        None => false,
        Some(day) => next_payday_day.map_or(true, |np| day < np),
    }
}

pub fn is_next_window_due(t: &TransactionResponse, next: Option<NaiveDate>, following: Option<NaiveDate>) -> bool {
    let (Some(next), Some(following)) = (next, following) else { return false };
    let raw = if t.is_recurring { nz(&t.next_occurrence).or(nz(&t.anchor_date)) } else { nz(&t.anchor_date).or(Some(&t.timestamp)) };
    raw.and_then(parse_day).is_some_and(|d| d >= next && d < following)
}

/// Balance after the next pay window: current balance minus what's reserved now, plus that window's income and minus its obligations.
pub fn compute_projected_balance_after_next_window(
    current_balance: f64,
    txns: &[TransactionResponse],
    schedules: &[PayScheduleResponse],
    breakdown: &[FriendDebtBreakdownItem],
    next_payday: Option<&str>,
) -> Option<f64> {
    let np = next_payday?;
    if schedules.is_empty() {
        return None;
    }
    let start = parse_date_only_utc(np)?;
    let end = earliest_payday_after(schedules, start)?;
    let cur = |o: &Option<String>| o.as_deref().is_some_and(|o| is_in_current_pay_window(o, next_payday));
    let nxt = |o: &Option<String>| o.as_deref().is_some_and(|o| in_range(o, start, end));

    let reserved_peer: f64 = breakdown
        .iter()
        .filter(|d| d.next_payment_date.as_deref().map_or(true, |o| is_in_current_pay_window(o, next_payday)))
        .map(|d| d.next_payment)
        .sum();
    let rec_cur: f64 = txns.iter().filter(|t| t.is_recurring && cur(&t.next_occurrence)).map(|t| t.amount.abs()).sum();
    let inst_cur: f64 = txns.iter().filter(|t| t.is_installment && t.amount < 0.0 && cur(&t.next_occurrence)).map(|t| t.amount.abs()).sum();
    let start_balance = current_balance - rec_cur - inst_cur - reserved_peer;

    let rec_next: f64 = txns.iter().filter(|t| t.is_recurring && nxt(&t.next_occurrence)).map(|t| t.amount.abs()).sum();
    let inst_next: f64 = txns.iter().filter(|t| t.is_installment && t.amount < 0.0 && nxt(&t.next_occurrence)).map(|t| t.amount.abs()).sum();
    let peer_next: f64 = breakdown.iter().filter(|d| nxt(&d.next_payment_date)).map(|d| d.next_payment).sum();

    Some(start_balance + income_between(schedules, start, end) - rec_next - inst_next - peer_next)
}

pub fn build_impact_summary(
    txns: &[TransactionResponse],
    schedules: &[PayScheduleResponse],
    next_payday: Option<&str>,
    current_balance: f64,
    projected_after_next_window: Option<f64>,
) -> ImpactSummary {
    let (next, following) = get_window_bounds(schedules, next_payday);
    let confirmable = || txns.iter().filter(|t| !t.is_recurring && pending(t));
    let in_current: Vec<_> = confirmable().filter(|t| is_current_due(t, next_payday, next)).collect();
    let in_next: Vec<_> = confirmable().filter(|t| is_next_window_due(t, next, following)).collect();
    let obligation = |t: &&TransactionResponse| if t.amount < 0.0 { t.amount.abs() } else { 0.0 };
    let current_amount: f64 = in_current.iter().map(obligation).sum();
    let next_amount: f64 = in_next.iter().map(obligation).sum();
    ImpactSummary {
        current_count: in_current.len(),
        next_count: in_next.len(),
        current_amount,
        next_amount,
        current_projected_balance: current_balance - current_amount,
        next_projected_balance: projected_after_next_window.unwrap_or(current_balance) - current_amount - next_amount,
    }
}

/// `preset: None` = default view: recurring + in-progress installments + pending one-time.
pub fn matches_preset_filter(
    t: &TransactionResponse,
    preset: Option<Preset>,
    next_payday: Option<&str>,
    schedules: &[PayScheduleResponse],
) -> bool {
    let (next, following) = get_window_bounds(schedules, next_payday);
    let pending_one_time = !t.is_recurring && !t.is_installment && pending(t);
    match preset {
        None => t.is_recurring || (t.is_installment && t.next_occurrence.is_some()) || pending_one_time,
        Some(Preset::AllRecurring) => t.is_recurring,
        Some(Preset::OneTimeOnly) => !t.is_recurring && !t.is_installment,
        Some(Preset::NextWindow) => {
            if t.is_installment {
                let (Some(n), Some(f)) = (next, following) else { return false };
                return t.next_occurrence.as_deref().and_then(parse_day).is_some_and(|d| d >= n && d < f);
            }
            (t.is_recurring || pending_one_time) && is_next_window_due(t, next, following)
        }
        Some(Preset::DueNow) => {
            if t.is_installment {
                return t.next_occurrence.as_deref().is_some_and(|o| is_in_current_pay_window(o, next_payday));
            }
            !t.is_recurring && pending(t) && is_current_due(t, next_payday, next)
        }
        Some(Preset::CurrentWindow) => is_current_due(t, next_payday, next),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schedules() -> Vec<PayScheduleResponse> {
        vec![PayScheduleResponse {
            frequency: "monthly".into(),
            anchor_date: "2026-04-01".into(),
            next_payday: "2026-04-20".into(),
            amount: 3000.0,
            ..Default::default()
        }]
    }
    fn txn(f: impl FnOnce(&mut TransactionResponse)) -> TransactionResponse {
        let mut t = TransactionResponse {
            amount: -100.0,
            timestamp: "2026-04-10T00:00:00Z".into(),
            requires_confirmation: true,
            ..Default::default()
        };
        f(&mut t);
        t
    }
    fn some(s: &str) -> Option<String> {
        Some(s.into())
    }
    fn matches(t: &TransactionResponse, p: Option<Preset>) -> bool {
        matches_preset_filter(t, p, Some("2026-04-20"), &schedules())
    }
    fn installment(next: &str, requires: bool) -> TransactionResponse {
        txn(|t| {
            t.is_installment = true;
            t.requires_confirmation = requires;
            t.next_occurrence = some(next);
        })
    }
    fn summary(t: &[TransactionResponse], np: Option<&str>, sch: &[PayScheduleResponse], bal: f64, after: Option<f64>) -> ImpactSummary {
        build_impact_summary(t, sch, np, bal, after)
    }

    #[test]
    fn counts_negative_pending() {
        let s = summary(&[txn(|t| t.amount = -250.0)], Some("2026-04-20"), &schedules(), 1000.0, None);
        assert_eq!((s.current_count, s.current_amount, s.current_projected_balance), (1, 250.0, 750.0));
    }

    #[test]
    fn overdue_one_time_is_current() {
        assert!(matches(&txn(|t| t.timestamp = "2026-01-10T00:00:00Z".into()), Some(Preset::CurrentWindow)));
    }

    #[test]
    fn splits_current_and_next() {
        let t = [
            txn(|t| t.id = "current".into()),
            txn(|t| {
                t.amount = -75.0;
                t.anchor_date = some("2026-04-21T00:00:00Z");
            }),
            txn(|t| {
                t.is_recurring = true;
                t.requires_confirmation = false;
                t.amount = -60.0;
                t.next_occurrence = some("2026-04-19T00:00:00Z");
            }),
        ];
        let s = summary(&t, Some("2026-04-20"), &schedules(), 1000.0, None);
        assert_eq!((s.current_amount, s.next_amount, s.current_count, s.next_count), (100.0, 75.0, 1, 1));
        // projected base provided
        let s = summary(&t, Some("2026-04-20"), &schedules(), 1000.0, Some(1300.0));
        assert_eq!((s.current_projected_balance, s.next_projected_balance), (900.0, 1125.0));
    }

    #[test]
    fn no_payday_means_all_current() {
        let t = [
            txn(|t| {
                t.amount = -80.0;
                t.timestamp = "2026-06-01T00:00:00Z".into();
            }),
            txn(|t| {
                t.is_recurring = true;
                t.requires_confirmation = false;
                t.amount = -20.0;
                t.next_occurrence = some("2026-06-10T00:00:00Z");
            }),
        ];
        let s = summary(&t, None, &[], 500.0, None);
        assert_eq!((s.current_amount, s.next_amount), (80.0, 0.0));
    }

    #[test]
    fn installment_presets() {
        let cur = installment("2026-04-15T00:00:00Z", false);
        assert!(matches(&cur, Some(Preset::CurrentWindow)));
        assert!(matches(&cur, Some(Preset::DueNow)));
        assert!(!matches(&cur, Some(Preset::OneTimeOnly)));
        assert!(matches(&installment("2026-04-22T00:00:00Z", false), Some(Preset::NextWindow)));
        assert!(matches(&installment("2026-04-22T00:00:00Z", false), None));
    }

    #[test]
    fn default_preset() {
        assert!(matches(&txn(|t| {
            t.is_recurring = true;
            t.requires_confirmation = false;
        }), None));
        assert!(matches(&txn(|_| {}), None)); // pending one-time
        assert!(!matches(&txn(|t| t.confirmed_at = some("2026-04-09T00:00:00Z")), None));
        assert!(!matches(&txn(|t| t.requires_confirmation = false), None));
    }

    #[test]
    fn ignores_recurring_in_payment_impact() {
        let rec = |amount: f64| {
            txn(|t| {
                t.is_recurring = true;
                t.amount = amount;
                t.next_occurrence = some("2026-04-18T00:00:00Z");
            })
        };
        let s = summary(&[txn(|_| {}), rec(-200.0), rec(300.0)], Some("2026-04-20"), &schedules(), 1000.0, None);
        assert_eq!((s.current_count, s.current_amount, s.current_projected_balance), (1, 100.0, 900.0));
    }

    #[test]
    fn labels_and_projected_balance() {
        let l = get_window_labels(Some("2026-04-20"), &schedules());
        assert_eq!(l.current_window, "Current (until 04/20/2026)");
        assert_eq!(l.next_window, "Next (04/20/2026 – 05/20/2026)");
        assert_eq!(get_window_labels(None, &[]).next_window, "Next window");
        let t = [txn(|t| {
            t.is_recurring = true;
            t.requires_confirmation = false;
            t.amount = -60.0;
            t.next_occurrence = some("2026-04-19T00:00:00Z");
        })];
        let r = compute_projected_balance_after_next_window(1000.0, &t, &schedules(), &[], Some("2026-04-20"));
        assert_eq!(r, Some(940.0)); // window Apr 20..May 1 (exclusive): no payday inside
        assert_eq!(compute_projected_balance_after_next_window(1.0, &[], &[], &[], Some("2026-04-20")), None);
    }
}
