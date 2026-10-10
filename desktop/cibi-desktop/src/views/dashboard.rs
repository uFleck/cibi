//! Dashboard (web/src/router.tsx '/'): stat cards, pay window, goals, Can-I-Buy-It check, friend ledger,
//! obligations, monthly projection. Skipped vs web: recent-ledger widget, pay-schedule list (Accounts page has it).
use super::ui::{card, money, row};
use crate::state::AppState;
use chrono::{DateTime, Duration, Months, Utc};
use cibi_client::{
    format::{format_date, parse_decimal_input},
    models::*,
    pay_schedule::{earliest_payday_after, next_payday_after, parse_date_only_utc},
    projection::compute_monthly_projection,
    window::is_in_current_pay_window,
    Client, Error,
};
use gpui_kit::component::{button::*, input::*, progress::Progress, *};
use gpui_kit::*;

/// Everything the dashboard shows for one account, fetched in one background job.
#[derive(Default)]
struct Data {
    txns: Vec<TransactionResponse>,
    schedules: Vec<PayScheduleResponse>,
    breakdown: Vec<FriendDebtBreakdownItem>,
    friends: FriendSummaryResponse,
    goals: GoalsTrackingResponse,
}

fn load(c: Client, id: &str) -> Result<Data, Error> {
    Ok(Data {
        txns: c.fetch_transactions(id)?,
        schedules: c.list_pay_schedules(id)?,
        breakdown: c.fetch_friend_breakdown(id)?,
        friends: c.fetch_friend_summary(id)?,
        goals: c.fetch_goals_tracking(id)?,
    })
}

/// Keeps the page state alive across renders so `Shell` needs no changes.
pub struct Dashboard {
    pub state: Entity<AppState>,
}

impl Render for Dashboard {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let state = self.state.clone();
        window.use_keyed_state("dashboard-body", cx, |window, cx| Body::new(state, window, cx))
    }
}

struct Body {
    state: Entity<AppState>,
    loaded_for: Option<String>,
    data: Option<Data>,
    amount: Entity<InputState>,
    checking: bool,
    check: Option<Result<CheckResponse, String>>,
}

impl Body {
    fn new(state: Entity<AppState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        cx.observe(&state, |b, _, cx| b.reload(false, cx)).detach();
        let amount = cx.new(|cx| InputState::new(window, cx).placeholder("0.00"));
        let mut b = Self { state, loaded_for: None, data: None, amount, checking: false, check: None };
        b.reload(false, cx);
        b
    }

    /// Fetch when the selected account changed (or `force`).
    fn reload(&mut self, force: bool, cx: &mut Context<Self>) {
        let Some(id) = self.state.read(cx).selected.clone() else { return };
        if !force && self.loaded_for.as_ref() == Some(&id) {
            return;
        }
        if self.loaded_for.as_ref() != Some(&id) {
            self.data = None;
            self.check = None;
        }
        self.loaded_for = Some(id.clone());
        let me = cx.entity();
        self.state.update(cx, |s, cx| {
            s.fetch(cx, move |c| load(c, &id), move |_, d, cx| me.update(cx, |b, cx| {
                b.data = Some(d);
                cx.notify();
            }))
        });
    }

    fn run_check(&mut self, cx: &mut Context<Self>) {
        let Some(amount) = parse_decimal_input(&self.amount.read(cx).value()).filter(|a| *a > 0.0) else { return };
        let Some(id) = self.loaded_for.clone() else { return };
        let client = self.state.read(cx).client.clone();
        self.checking = true;
        cx.notify();
        cx.spawn(async move |this, cx| {
            let res = cx.background_spawn(async move { client.post_check(amount, Some(&id)) }).await;
            this.update(cx, |b, cx| {
                b.checking = false;
                b.check = Some(res.map_err(|e| match e {
                    Error::Api { code: Some(c), .. } if c == "PAY_SCHEDULE_REQUIRED" => {
                        "Set up your pay schedule in Accounts first, then try again.".to_string()
                    }
                    e => e.to_string(),
                }));
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

fn now() -> DateTime<Utc> {
    let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    DateTime::from_timestamp(d.as_secs() as i64, 0).unwrap_or_default()
}

/// Start of the current pay window: next payday minus one frequency step, like PayWindowBar.tsx.
fn previous_payday(s: &PayScheduleResponse) -> Option<DateTime<Utc>> {
    let p = parse_date_only_utc(&s.next_payday)? - Duration::milliseconds(1);
    let p = match s.frequency.as_str() {
        "weekly" => p - Duration::days(7),
        "bi-weekly" => p - Duration::days(14),
        "semi-monthly" => p - Duration::days(15),
        _ => p.checked_sub_months(Months::new(1))?,
    };
    parse_date_only_utc(&p.format("%Y-%m-%d").to_string())
}

impl Render for Body {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let root = v_flex().id("dashboard").size_full().overflow_y_scroll().p_6().gap_4();
        let st = self.state.read(cx);
        let Some(acct) = st.selected.as_ref().and_then(|id| st.accounts.iter().find(|a| &a.id == id)).cloned() else {
            return root.child(if st.loading() { "Loading..." } else { "Create your first account in Accounts to get started." });
        };
        let Some(d) = &self.data else { return root.child("Loading...") };
        let cur = acct.currency.as_str();
        let muted = cx.theme().muted_foreground;
        let np = d.schedules.iter().map(|s| s.next_payday.as_str()).min();
        let in_win = |o: &str| is_in_current_pay_window(o, np);

        // Obligations due before next payday (recurring, or unpaid installments).
        let mut obl: Vec<&TransactionResponse> = d
            .txns
            .iter()
            .filter(|t| {
                let due = t.next_occurrence.as_deref().is_some_and(in_win);
                due && if t.is_installment { t.paid_installments < t.total_installments.unwrap_or(0) } else { t.is_recurring }
            })
            .collect();
        obl.sort_by_key(|t| t.next_occurrence.clone());
        let recurring: f64 = obl.iter().filter(|t| !t.is_installment).map(|t| t.amount.abs()).sum();
        let installments: f64 = obl.iter().filter(|t| t.is_installment).map(|t| t.amount.abs()).sum();
        let peers: f64 = d.breakdown.iter().filter(|b| b.next_payment_date.as_deref().is_none_or(in_win)).map(|b| b.next_payment).sum();
        let reserved = recurring + installments + peers;
        let liquid = acct.current_balance - reserved;

        let stat = |label: &str, v: f64, color: Option<Hsla>| {
            let t = div().text_2xl().child(money(v, cur));
            card(cx, label).flex_1().child(if let Some(c) = color { t.text_color(c) } else { t })
        };
        let stats = h_flex()
            .gap_3()
            .child(stat("Balance", acct.current_balance, None))
            .child(stat("Reserved", reserved, Some(cx.theme().warning)))
            .child(stat("Liquid", liquid, Some(if liquid <= 0.0 { cx.theme().danger } else { cx.theme().success })));
        let reserved_card = card(cx, "Reserved breakdown")
            .child(row(cx, "Recurring obligations", money(recurring, cur)))
            .child(row(cx, "Peer debts (owed)", money(peers, cur)))
            .child(row(cx, "Installment obligations", money(installments, cur)))
            .child(row(cx, "Safety buffer", money(acct.safety_buffer, cur)))
            .child(row(cx, "Total reserved", money(reserved + acct.safety_buffer, cur)));

        let mut page = root.child(stats).child(reserved_card);
        if d.txns.is_empty() && d.schedules.is_empty() {
            page = page.child(card(cx, "Set up your finances").child(
                div().text_sm().child("1. Add a pay schedule (Accounts)  2. Create recurring bills (Transactions)  3. Try Can I Buy It? below"),
            ));
        }

        // Pay window bar.
        if let (Some(np), Some(primary)) = (np, d.schedules.iter().min_by_key(|s| s.next_payday.clone())) {
            if let (Some(next), Some(prev)) = (parse_date_only_utc(np), previous_payday(primary)) {
                let n = now();
                let total = (next - prev).num_milliseconds() as f32;
                let pct = if total > 0.0 { ((n - prev).num_milliseconds() as f32 / total * 100.0).clamp(0.0, 100.0) } else { 0.0 };
                let days = (((next - n).num_seconds() as f64) / 86400.0).ceil().max(0.0) as i64;
                // Income landing in the window after the next payday.
                let mut incoming = 0.0;
                if let Some(end) = earliest_payday_after(&d.schedules, next) {
                    for s in &d.schedules {
                        let mut o = next_payday_after(s, next - Duration::milliseconds(1));
                        for _ in 0..24 {
                            match o {
                                Some(x) if x < end => {
                                    if x >= next {
                                        incoming += s.amount;
                                    }
                                    o = next_payday_after(s, x);
                                }
                                _ => break,
                            }
                        }
                    }
                }
                page = page.child(
                    card(cx, "Pay window")
                        .child(div().text_sm().child(format!("{days} day{} until next payday", if days == 1 { "" } else { "s" })))
                        .child(
                            h_flex()
                                .justify_between()
                                .text_xs()
                                .text_color(muted)
                                .child(format!("Payday: {}", format_date(&prev.to_rfc3339())))
                                .child(format!("Next: {}", format_date(np))),
                        )
                        .child(Progress::new("pay-window").value(pct))
                        .child(row(cx, "Next income", money(primary.amount, cur)))
                        .child(row(cx, "Window total", money(incoming, cur))),
                );
            }
        }

        // Goals snapshot.
        let g = &d.goals;
        let mut goals = card(cx, "Goals").child(row(
            cx,
            format!("{} goals, {} completed", g.summary.goals_count, g.summary.completed_count),
            format!("{} / {}", money(g.summary.total_invested, cur), money(g.summary.total_target, cur)),
        ));
        if g.top_goals.is_empty() {
            goals = goals.child(div().text_sm().text_color(muted).child("No goals yet."));
        }
        for t in &g.top_goals {
            goals = goals
                .child(row(cx, t.name.clone(), format!("{:.1}% · {} left", t.progress_pct.clamp(0.0, 100.0), money(t.remaining_amount, cur))))
                .child(Progress::new(SharedString::from(format!("goal-{}", t.id))).value(t.progress_pct as f32));
        }
        page = page.child(goals);

        // Can I Buy It?
        let mut chk = card(cx, "Can I buy it?").child(
            h_flex().gap_2().child(Input::new(&self.amount).flex_1()).child(
                Button::new("check")
                    .primary()
                    .label(if self.checking { "Checking..." } else { "CHECK" })
                    .disabled(self.checking)
                    .on_click(cx.listener(|b, _, _, cx| b.run_check(cx))),
            ),
        );
        match &self.check {
            Some(Err(e)) => chk = chk.child(div().text_sm().text_color(cx.theme().danger).child(e.clone())),
            Some(Ok(r)) => {
                let wait = !r.can_buy && r.will_afford_after_payday;
                let (word, color) = if r.can_buy {
                    ("YES", cx.theme().success)
                } else if wait {
                    ("WAIT", cx.theme().warning)
                } else {
                    ("NO", cx.theme().danger)
                };
                chk = chk
                    .child(h_flex().justify_between().child(div().text_3xl().text_color(color).child(word)).child(format!("{} RISK", r.risk_level)))
                    .child(row(cx, "Purchasing power", money(r.purchasing_power, cur)))
                    .child(row(cx, "Buffer remaining", money(r.buffer_remaining, cur)));
                if let (true, Some(w)) = (wait, &r.wait_until) {
                    chk = chk.child(div().text_sm().child(format!("Not yet: you'll have enough after {}", format_date(w))));
                }
                if r.goal_impacts.is_empty() {
                    chk = chk.child(div().text_sm().text_color(muted).child("No active goals affected."));
                }
                for i in &r.goal_impacts {
                    chk = chk.child(row(cx, format!("{} ({})", i.goal_name, i.severity), format!("min/window {}", money(i.min_contribution_per_window, cur))));
                }
                for c in &r.goals_covered_this_window {
                    chk = chk.child(row(
                        cx,
                        format!("{} covered this window", c.goal_name),
                        format!("{} / {}", money(c.contributed_this_window, cur), money(c.min_contribution_per_window, cur)),
                    ));
                }
            }
            None => {}
        }
        page = page.child(chk);

        // Friend ledger.
        let f = &d.friends;
        let mut fl = card(cx, "Friend ledger");
        if f.total_owed_to_user == 0.0 && f.total_user_owes == 0.0 {
            fl = fl.child(div().text_sm().text_color(muted).child("No outstanding balances."));
        } else {
            fl = fl
                .child(row(cx, "They owe me", money(f.total_owed_to_user, cur)))
                .child(row(cx, "I owe", money(f.total_user_owes, cur)))
                .child(row(cx, "Net", money(f.net, cur)));
            for b in &d.breakdown {
                let when = b.next_payment_date.as_deref().map(format_date).unwrap_or_default();
                fl = fl.child(row(cx, format!("{} {when}", b.friend_name), money(b.next_payment, cur)));
            }
        }
        page = page.child(fl);

        // Obligations.
        let mut ol = card(cx, "Upcoming obligations");
        if obl.is_empty() {
            ol = ol.child(div().text_sm().text_color(muted).child("No upcoming obligations."));
        }
        for t in &obl {
            let inst = if t.is_installment { format!(" {}/{}", t.paid_installments, t.total_installments.unwrap_or(0)) } else { String::new() };
            let when = t.next_occurrence.as_deref().map(format_date).unwrap_or_default();
            ol = ol.child(row(cx, format!("{}{inst}  ·  {when}", t.description), money(t.amount.abs(), cur)));
        }
        page = page.child(ol.child(row(cx, "Total reserved", money(recurring + installments, cur))));

        // Projection.
        let p = compute_monthly_projection(&acct, &d.txns, &d.schedules, &d.breakdown, now());
        page.child(
            card(cx, "Monthly projection")
                .child(row(cx, "Income", money(p.income, cur)))
                .child(row(cx, "Recurring", money(p.recurring_obligations, cur)))
                .child(row(cx, "Installments", money(p.installment_obligations, cur)))
                .child(row(cx, "Peer debts", money(p.peer_obligations, cur)))
                .child(row(cx, "Net", money(p.net, cur)))
                .child(row(cx, "Projected end balance", money(p.projected_end_balance, cur))),
        )
        .child(Button::new("refresh").ghost().label("Refresh").on_click(cx.listener(|b, _, _, cx| b.reload(true, cx))))
    }
}
