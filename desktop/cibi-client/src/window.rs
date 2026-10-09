use crate::pay_schedule::parse_ts;
use chrono::NaiveDate;

/// Due/overdue items stay visible until confirmed; the upper bound (next payday day) is exclusive.
pub fn is_in_current_pay_window(occurrence: &str, next_payday: Option<&str>) -> bool {
    let Some(occ) = parse_ts(occurrence) else { return false };
    let Some(np) = next_payday else { return true };
    match NaiveDate::parse_from_str(np, "%Y-%m-%d") {
        Ok(p) => occ.date_naive() < p,
        Err(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window() {
        let np = Some("2026-04-20");
        assert!(is_in_current_pay_window("2026-04-19T09:00:00Z", np));
        assert!(!is_in_current_pay_window("2026-04-20T00:00:00Z", np));
        assert!(is_in_current_pay_window("2026-04-15T00:00:00Z", np));
        assert!(is_in_current_pay_window("2026-04-10T00:00:00Z", np)); // overdue
        assert!(is_in_current_pay_window("2026-04-20T00:00:00Z", Some("2026-05-10")));
        assert!(!is_in_current_pay_window("2026-05-10T00:00:00Z", Some("2026-05-10")));
        assert!(is_in_current_pay_window("2026-05-10T00:00:00Z", None));
        assert!(is_in_current_pay_window("2026-01-01T00:00:00Z", None));
    }
}
