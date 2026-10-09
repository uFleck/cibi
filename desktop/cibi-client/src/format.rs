//! en-US formatting (app locale is en-US; currency stays as the account's, usually BRL).
use crate::pay_schedule::parse_ts;
use chrono::{Datelike, Timelike};

pub fn format_money(amount: f64, currency: &str) -> String {
    let symbol = match currency {
        "BRL" => "R$",
        "USD" => "$",
        "EUR" => "€",
        "GBP" => "£",
        c => return format!("{}{c}\u{a0}{}", if amount < 0.0 { "-" } else { "" }, group(amount.abs())),
    };
    format!("{}{symbol}{}", if amount < 0.0 { "-" } else { "" }, group(amount.abs()))
}

fn group(abs: f64) -> String {
    let s = format!("{abs:.2}");
    let (int, frac) = s.split_once('.').unwrap();
    let mut out = String::new();
    for (i, c) in int.chars().enumerate() {
        if i > 0 && (int.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    format!("{out}.{frac}")
}

/// MM/DD/YYYY (UTC); empty string if unparseable.
pub fn format_date(iso: &str) -> String {
    parse_ts(iso).map(|d| format!("{:02}/{:02}/{}", d.month(), d.day(), d.year())).unwrap_or_default()
}

/// hh:mm:ss AM/PM (UTC).
pub fn format_time_utc(iso: &str) -> String {
    parse_ts(iso)
        .map(|d| {
            let (pm, h) = d.hour12();
            format!("{h:02}:{:02}:{:02} {}", d.minute(), d.second(), if pm { "PM" } else { "AM" })
        })
        .unwrap_or_default()
}

/// Accepts "12,5" or "12.5"; None when empty/invalid.
pub fn parse_decimal_input(raw: &str) -> Option<f64> {
    raw.trim().replacen(',', ".", 1).parse::<f64>().ok().filter(|n| n.is_finite())
}

/// `2026-04-20T00:00:00Z` -> `2026-04-20`.
pub fn to_date_input_value(v: Option<&str>) -> String {
    v.map(|s| s.split('T').next().unwrap_or(s).to_string()).unwrap_or_default()
}

pub fn from_date_input_value(v: Option<&str>) -> Option<String> {
    v.filter(|s| !s.is_empty()).map(|s| format!("{s}T00:00:00Z"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formatting() {
        assert_eq!(format_money(1234567.891, "BRL"), "R$1,234,567.89");
        assert_eq!(format_money(-0.5, "BRL"), "-R$0.50");
        assert_eq!(format_money(999.0, "USD"), "$999.00");
        assert_eq!(format_date("2026-04-05T23:59:00Z"), "04/05/2026");
        assert_eq!(format_time_utc("2026-04-05T15:04:05Z"), "03:04:05 PM");
        assert_eq!(format_time_utc("2026-04-05T00:04:05Z"), "12:04:05 AM");
        assert_eq!(parse_decimal_input(" 12,5 "), Some(12.5));
        assert_eq!(parse_decimal_input("abc"), None);
        assert_eq!(parse_decimal_input(""), None);
        assert_eq!(to_date_input_value(Some("2026-04-20T00:00:00Z")), "2026-04-20");
        assert_eq!(from_date_input_value(Some("2026-04-20")).as_deref(), Some("2026-04-20T00:00:00Z"));
        assert_eq!(from_date_input_value(Some("")), None);
    }
}
