//! Custom projection sheet: pick a start and end payday, see income/obligations/balance.
use chrono::{DateTime, Duration, Utc};
use cibi_client::{
    format::{format_date, format_money},
    models::*,
    pay_schedule::next_payday_after,
    projection::compute_custom_projection,
};
use gpui_kit::component::{button::*, switch::Switch, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

#[derive(Default)]
pub struct Proj {
    account: AccountResponse,
    txns: Vec<TransactionResponse>,
    schedules: Vec<PayScheduleResponse>,
    breakdown: Vec<FriendDebtBreakdownItem>,
    dates: Vec<DateTime<Utc>>,
    start: Option<usize>,
    end: Option<usize>,
    exclude: bool,
}

impl Proj {
    pub fn open(&mut self, account: AccountResponse, txns: Vec<TransactionResponse>, schedules: Vec<PayScheduleResponse>, breakdown: Vec<FriendDebtBreakdownItem>) {
        let now = Utc::now();
        let mut dates = vec![];
        for s in &schedules {
            // ponytail: 6 months out, 30 paydays per schedule, like the web sheet.
            let mut occ = next_payday_after(s, now - Duration::milliseconds(1));
            for _ in 0..30 {
                match occ {
                    Some(o) if o < now + Duration::days(180) => {
                        dates.push(o);
                        occ = next_payday_after(s, o);
                    }
                    _ => break,
                }
            }
        }
        dates.sort();
        dates.dedup_by_key(|d| d.date_naive());
        *self = Self { account, txns, schedules, breakdown, dates, ..Default::default() };
    }
}

impl Render for Proj {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let pick = |id: &'static str, from: usize, sel: Option<usize>, cx: &mut Context<Self>| {
            h_flex().flex_wrap().gap_2().children(self.dates.iter().enumerate().skip(from).map(|(i, d)| {
                Button::new((id, i)).label(format_date(&d.to_rfc3339())).when(sel == Some(i), |b| b.primary()).on_click(cx.listener(move |p, _, _, cx| {
                    if id == "s" {
                        p.start = Some(i);
                        p.end = None;
                    } else {
                        p.end = Some(i);
                    }
                    cx.notify();
                }))
            }))
        };
        let cur = self.account.currency.clone();
        let result = self.start.zip(self.end).map(|(s, e)| {
            let r = compute_custom_projection(&self.account, &self.txns, &self.schedules, &self.breakdown, self.dates[s], self.dates[e], self.exclude, Utc::now());
            let row = |l: &'static str, v: f64| h_flex().justify_between().child(l).child(format_money(v, &cur));
            v_flex().gap_1().child(row("Income", r.income)).child(row("Obligations", -r.obligations)).child(row("Net", r.net)).child(row("Projected end balance", r.projected_end_balance))
        });
        v_flex()
            .gap_3()
            .child(div().text_sm().font_weight(FontWeight::MEDIUM).child("Start paycheck"))
            .child(pick("s", 0, self.start, cx))
            .when_some(self.start, |d, s| d.child(div().text_sm().font_weight(FontWeight::MEDIUM).child("End paycheck")).child(pick("e", s + 1, self.end, cx)))
            .child(Switch::new("excl").label("Start from zero (ignore current balance)").checked(self.exclude).on_click(cx.listener(|p, v: &bool, _, cx| {
                p.exclude = *v;
                cx.notify();
            })))
            .children(result)
    }
}
