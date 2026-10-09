//! Transactions page: impact preview, filters, list with confirm/edit/delete, create/edit sheet,
//! custom projection sheet, recent ledger activity. `Transactions` is a thin wrapper that lazily
//! builds `Page` (it needs a `Window` for its inputs), so the shell can construct it with just `state`.
mod form;
mod projection;

use crate::state::AppState;
use chrono::NaiveDate;
use cibi_client::{
    format::{format_date, format_money, from_date_input_value, parse_decimal_input},
    impact::*,
    models::*,
    Client, Error,
};
use form::{Form, FREQS};
use gpui_kit::component::{button::*, input::{InputEvent, InputState, Input}, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;
use projection::Proj;

pub struct Transactions {
    pub state: Entity<AppState>,
}

impl Render for Transactions {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let state = self.state.clone();
        window.use_keyed_state("transactions-page", cx, move |w, cx| Page::new(state, w, cx))
    }
}

const PRESETS: [Preset; 5] = [Preset::DueNow, Preset::CurrentWindow, Preset::NextWindow, Preset::AllRecurring, Preset::OneTimeOnly];
const SORTS: [&str; 3] = ["Description", "Date", "Amount"];

pub struct Page {
    state: Entity<AppState>,
    form: Entity<Form>,
    proj: Entity<Proj>,
    loaded_for: Option<String>,
    txns: Vec<TransactionResponse>,
    schedules: Vec<PayScheduleResponse>,
    breakdown: Vec<FriendDebtBreakdownItem>,
    ledger: Vec<LedgerEntryResponse>,
    ledger_tab: bool,
    preset: Option<Preset>,
    sort: usize,
    asc: bool,
    search: Entity<InputState>,
    min: Entity<InputState>,
    max: Entity<InputState>,
}

fn sort_date(t: &TransactionResponse) -> String {
    let nz = |o: &Option<String>| o.clone().filter(|s| !s.is_empty());
    let (a, ts) = (nz(&t.anchor_date), Some(t.timestamp.clone()));
    if t.is_recurring {
        nz(&t.next_occurrence).or(a).or(ts)
    } else if t.requires_confirmation {
        a.or(ts)
    } else {
        ts.or(a)
    }
    .unwrap_or_default()
}

impl Page {
    fn new(state: Entity<AppState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let page = cx.weak_entity();
        let mut input = |ph: &'static str| {
            let i = cx.new(|cx| InputState::new(window, cx).placeholder(ph));
            cx.subscribe(&i, |_, _, _: &InputEvent, cx| cx.notify()).detach();
            i
        };
        let (search, min, max) = (input("Search description"), input("Min amount"), input("Max amount"));
        cx.observe(&state, |p, s, cx| {
            if s.read(cx).selected != p.loaded_for {
                p.reload(cx);
            }
        })
        .detach();
        let mut me = Self {
            form: cx.new(|cx| Form::new(page, window, cx)),
            proj: cx.new(|_| Proj::default()),
            state,
            loaded_for: None,
            txns: vec![],
            schedules: vec![],
            breakdown: vec![],
            ledger: vec![],
            ledger_tab: false,
            preset: None,
            sort: 1,
            asc: true,
            search,
            min,
            max,
        };
        me.reload(cx);
        me
    }

    /// Run a blocking call off the UI thread; results for a stale account are dropped, errors go to the shell toast.
    fn run<T: Send + 'static>(
        &mut self,
        cx: &mut Context<Self>,
        call: impl FnOnce(Client) -> Result<T, Error> + Send + 'static,
        done: impl FnOnce(&mut Self, T, &mut Context<Self>) + 'static,
    ) {
        let client = self.state.read(cx).client.clone();
        let acct = self.loaded_for.clone();
        cx.spawn(async move |this, cx| {
            let res = cx.background_spawn(async move { call(client) }).await;
            this.update(cx, |p, cx| match res {
                Ok(v) if p.loaded_for == acct => done(p, v, cx),
                Ok(_) => {}
                Err(e) => p.state.update(cx, |s, cx| {
                    s.error = Some(e.to_string());
                    cx.notify();
                }),
            })
            .ok();
        })
        .detach();
    }

    fn reload(&mut self, cx: &mut Context<Self>) {
        let Some(id) = self.state.read(cx).selected.clone() else { return };
        if self.loaded_for.as_ref() != Some(&id) {
            (self.txns, self.schedules, self.breakdown, self.ledger) = Default::default();
            self.loaded_for = Some(id.clone());
        }
        let i = id.clone();
        self.run(cx, move |c| c.fetch_transactions(&i), |p, v, cx| {
            p.txns = v;
            cx.notify();
        });
        let i = id.clone();
        self.run(cx, move |c| c.list_pay_schedules(&i), |p, v, cx| {
            p.schedules = v;
            cx.notify();
        });
        let i = id.clone();
        self.run(cx, move |c| c.fetch_friend_breakdown(&i), |p, v, cx| {
            p.breakdown = v;
            cx.notify();
        });
        self.run(cx, move |c| c.fetch_ledger(&id), |p, v, cx| {
            p.ledger = v;
            cx.notify();
        });
    }

    /// Mutation finished: re-read balances and this page's data.
    fn mutate<T: Send + 'static>(&mut self, cx: &mut Context<Self>, call: impl FnOnce(Client) -> Result<T, Error> + Send + 'static) {
        self.run(cx, call, |p, _, cx| {
            p.state.update(cx, |s, cx| s.refresh_accounts(cx));
            p.reload(cx);
        });
    }

    fn next_payday(&self) -> Option<String> {
        self.schedules.iter().map(|s| s.next_payday.clone()).min()
    }

    fn open_form(&mut self, t: Option<TransactionResponse>, window: &mut Window, cx: &mut Context<Self>) {
        let form = self.form.clone();
        form.update(cx, |f, cx| f.load(t.as_ref(), window, cx));
        let title = if t.is_some() { "Edit transaction" } else { "New transaction" };
        window.open_sheet(cx, move |s, _, _| s.title(title).child(form.clone()));
    }

    /// Validate the form and create/update. Called by the form's save button.
    pub fn submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(account_id) = self.state.read(cx).selected.clone() else { return };
        let (res, editing) = self.form.update(cx, |f, cx| {
            let desc = f.desc.read(cx).value().trim().to_string();
            let amount = parse_decimal_input(&f.amount.read(cx).value());
            let anchor = f.anchor.read(cx).value().to_string();
            let total = f.total.read(cx).value().trim().parse::<i64>().ok().filter(|n| *n > 0);
            let err = if desc.is_empty() {
                Some("Description is required")
            } else if amount.is_none_or(|a| a == 0.0) {
                Some("Amount must be a non-zero number")
            } else if !anchor.is_empty() && NaiveDate::parse_from_str(&anchor, "%Y-%m-%d").is_err() {
                Some("Date must be YYYY-MM-DD")
            } else if f.kind == 3 && total.is_none() {
                Some("Total installments must be a positive integer")
            } else if matches!(f.kind, 1 | 3) && anchor.is_empty() {
                Some("Date is required")
            } else {
                None
            };
            f.error = err.map(String::from);
            cx.notify();
            let res = match err {
                Some(_) => None,
                None => Some((amount.unwrap(), desc, f.kind, FREQS[f.freq].to_string(), from_date_input_value(Some(&anchor)), total)),
            };
            (res, f.editing.clone())
        });
        let Some((amount, description, kind, freq, anchor, total)) = res else { return };
        let (rec, inst) = (kind == 1, kind == 3);
        let (conf, freq) = (kind == 2, (rec || inst).then_some(freq));
        let total = total.filter(|_| inst);
        window.close_sheet(cx);
        match editing {
            Some(id) => {
                let d = UpdateTransactionRequest {
                    amount: Some(amount),
                    description: Some(description),
                    is_recurring: Some(rec),
                    requires_confirmation: Some(conf),
                    frequency: freq,
                    anchor_date: anchor,
                    is_installment: Some(inst),
                    total_installments: total,
                };
                self.mutate(cx, move |c| c.update_transaction(&id, &d));
            }
            None => {
                let d = CreateTransactionRequest {
                    account_id,
                    amount,
                    description,
                    is_recurring: Some(rec),
                    requires_confirmation: Some(conf),
                    frequency: freq,
                    anchor_date: anchor,
                    is_installment: Some(inst),
                    total_installments: total,
                };
                self.mutate(cx, move |c| c.create_transaction(&d));
            }
        }
    }

    fn confirm(&mut self, t: &TransactionResponse, cx: &mut Context<Self>) {
        let (id, inst) = (t.id.clone(), t.is_installment);
        self.mutate(cx, move |c| if inst { c.confirm_installment_transaction(&id) } else { c.confirm_transaction(&id) });
    }

    fn confirm_due_now(&mut self, ids: Vec<String>, cx: &mut Context<Self>) {
        self.mutate(cx, move |c| ids.iter().try_for_each(|id| c.confirm_transaction(id).map(drop)));
    }

    fn ask_delete(&mut self, t: &TransactionResponse, window: &mut Window, cx: &mut Context<Self>) {
        let (page, id, name) = (cx.weak_entity(), t.id.clone(), t.description.clone());
        window.open_dialog(cx, move |d, _, _| {
            let (page, id) = (page.clone(), id.clone());
            d.title("Delete transaction").child(format!("Delete \"{name}\"? This cannot be undone.")).on_ok(move |_, _, cx| {
                let id = id.clone();
                page.update(cx, |p, cx| p.mutate(cx, move |c| c.delete_transaction(&id))).ok();
                true
            })
        });
    }

    fn open_projection(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let st = self.state.read(cx);
        let Some(acct) = st.accounts.iter().find(|a| Some(&a.id) == st.selected.as_ref()).cloned() else { return };
        let proj = self.proj.clone();
        let (t, s, b) = (self.txns.clone(), self.schedules.clone(), self.breakdown.clone());
        proj.update(cx, |p, cx| {
            p.open(acct, t, s, b);
            cx.notify();
        });
        window.open_sheet(cx, move |s, _, _| s.title("Custom projection").child(proj.clone()));
    }
}

impl Render for Page {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let st = self.state.read(cx);
        let account = st.accounts.iter().find(|a| Some(&a.id) == st.selected.as_ref());
        let (cur, balance) = account.map_or(("BRL".to_string(), 0.0), |a| (a.currency.clone(), a.current_balance));
        let money = |v: f64| format_money(v, &cur);
        let np = self.next_payday();
        let labels = get_window_labels(np.as_deref(), &self.schedules);

        let after = compute_projected_balance_after_next_window(balance, &self.txns, &self.schedules, &self.breakdown, np.as_deref());
        let impact = build_impact_summary(&self.txns, &self.schedules, np.as_deref(), balance, after);
        let (next_day, _) = get_window_bounds(&self.schedules, np.as_deref());
        let due: Vec<String> = self
            .txns
            .iter()
            .filter(|t| !t.is_recurring && t.requires_confirmation && t.confirmed_at.is_none() && is_current_due(t, np.as_deref(), next_day))
            .map(|t| t.id.clone())
            .collect();
        let n_due = due.len();

        let q = self.search.read(cx).value().trim().to_lowercase();
        let (min, max) = (parse_decimal_input(&self.min.read(cx).value()), parse_decimal_input(&self.max.read(cx).value()));
        let mut rows: Vec<&TransactionResponse> = self
            .txns
            .iter()
            .filter(|t| t.r#type == "personal" && matches_preset_filter(t, self.preset, np.as_deref(), &self.schedules))
            .filter(|t| t.description.to_lowercase().contains(&q))
            .filter(|t| min.is_none_or(|m| t.amount.abs() >= m) && max.is_none_or(|m| t.amount.abs() <= m))
            .collect();
        rows.sort_by(|a, b| match self.sort {
            0 => a.description.to_lowercase().cmp(&b.description.to_lowercase()),
            1 => sort_date(a).cmp(&sort_date(b)),
            _ => a.amount.total_cmp(&b.amount),
        });
        if !self.asc {
            rows.reverse();
        }

        let muted = cx.theme().muted_foreground;
        let tab = |label: &'static str, on: bool, ledger: bool, cx: &mut Context<Self>| {
            Button::new(label).label(label).when(on, |b| b.primary()).on_click(cx.listener(move |p, _, _, cx| {
                p.ledger_tab = ledger;
                cx.notify();
            }))
        };

        let list = if self.ledger_tab {
            v_flex()
                .gap_1()
                .children(self.ledger.iter().map(|e| {
                    h_flex()
                        .justify_between()
                        .py_1()
                        .child(v_flex().child(div().text_xs().text_color(muted).child(format_date(&e.posted_at))).child(e.description.clone()))
                        .child(format!("{}{}", if e.amount >= 0.0 { "+" } else { "" }, money(e.amount)))
                }))
                .when(self.ledger.is_empty(), |d| d.child("No activity yet"))
        } else {
            v_flex()
                .gap_1()
                .children(rows.iter().enumerate().map(|(i, t)| {
                    let d = |o: &Option<String>| o.as_deref().filter(|s| !s.is_empty()).map_or("-".to_string(), format_date);
                    let (status, sub, can_confirm): (String, String, bool) = if t.is_installment {
                        (
                            format!("Installment {}/{}", t.paid_installments, t.total_installments.unwrap_or(0)),
                            format!("{} per installment · next {}", money(t.amount), d(&t.next_occurrence)),
                            t.paid_installments < t.total_installments.unwrap_or(0),
                        )
                    } else if t.is_recurring {
                        let next = if t.next_occurrence.is_some() { &t.next_occurrence } else { &t.anchor_date };
                        ("Recurring".into(), format!("{} · next {}", t.frequency.clone().unwrap_or_default(), d(next)), true)
                    } else if t.requires_confirmation {
                        match &t.confirmed_at {
                            Some(c) => ("Pending payment · confirmed".into(), format!("confirmed {}", format_date(c)), false),
                            None => {
                                let when = t.anchor_date.as_deref().filter(|s| !s.is_empty()).unwrap_or(&t.timestamp);
                                ("Pending payment".into(), format!("pending {}", format_date(when)), true)
                            }
                        }
                    } else {
                        ("One-time".into(), format_date(&t.timestamp), false)
                    };
                    let amount = if t.is_installment { t.amount * (t.total_installments.unwrap_or(0) - t.paid_installments) as f64 } else { t.amount };
                    let (tc, te, td) = ((*t).clone(), (*t).clone(), (*t).clone());
                    h_flex()
                        .justify_between()
                        .gap_3()
                        .py_1()
                        .child(v_flex().flex_1().child(t.description.clone()).child(div().text_xs().text_color(muted).child(format!("{status} · {sub}"))))
                        .child(div().font_weight(FontWeight::MEDIUM).text_color(if amount < 0.0 { cx.theme().danger } else { cx.theme().success }).child(money(amount)))
                        .child(
                            h_flex()
                                .gap_1()
                                .when(can_confirm, |h| h.child(Button::new(("ok", i)).label("Confirm").on_click(cx.listener(move |p, _, _, cx| p.confirm(&tc, cx)))))
                                .child(Button::new(("ed", i)).ghost().label("Edit").on_click(cx.listener(move |p, _, w, cx| p.open_form(Some(te.clone()), w, cx))))
                                .child(Button::new(("rm", i)).ghost().label("Delete").on_click(cx.listener(move |p, _, w, cx| p.ask_delete(&td, w, cx)))),
                        )
                }))
                .when(rows.is_empty(), |d| d.child(if self.txns.is_empty() { "No transactions yet" } else { "No transactions match your filters" }))
        };

        let chips = h_flex().flex_wrap().gap_2().children(PRESETS.iter().enumerate().map(|(i, &p)| {
            let label = match p {
                Preset::DueNow => labels.due_now.clone(),
                Preset::CurrentWindow => labels.current_window.clone(),
                Preset::NextWindow => labels.next_window.clone(),
                Preset::AllRecurring => "All recurring".into(),
                Preset::OneTimeOnly => "One-time only".into(),
            };
            Button::new(("preset", i)).label(label).when(self.preset == Some(p), |b| b.primary()).on_click(cx.listener(move |pg, _, _, cx| {
                pg.preset = if pg.preset == Some(p) { None } else { Some(p) };
                cx.notify();
            }))
        }));
        let sorts = h_flex().gap_2().children(SORTS.iter().enumerate().map(|(i, s)| {
            Button::new(("sort", i)).label(*s).when(self.sort == i, |b| b.primary()).on_click(cx.listener(move |p, _, _, cx| {
                p.asc = if p.sort == i { !p.asc } else { true };
                p.sort = i;
                cx.notify();
            }))
        }));

        v_flex()
            .size_full()
            .id("txn-scroll").overflow_y_scroll()
            .p_6()
            .gap_4()
            .child(
                h_flex()
                    .justify_between()
                    .child(div().text_xl().font_weight(FontWeight::BOLD).child("Transactions"))
                    .child(
                        h_flex()
                            .gap_2()
                            .child(Button::new("proj").label("Custom projection").on_click(cx.listener(|p, _, w, cx| p.open_projection(w, cx))))
                            .child(Button::new("new").primary().label("New transaction").on_click(cx.listener(|p, _, w, cx| p.open_form(None, w, cx)))),
                    ),
            )
            .child(
                v_flex()
                    .gap_1()
                    .p_3()
                    .rounded_md()
                    .border_1()
                    .border_color(cx.theme().border)
                    .child(div().text_xs().text_color(muted).child("UNCONFIRMED PAYMENT IMPACT"))
                    .child(format!("Current: {} ({}) · Next: {} ({})", money(impact.current_amount), impact.current_count, money(impact.next_amount), impact.next_count))
                    .child(div().text_sm().text_color(muted).child(format!(
                        "Balance if paid: {} now · {} after next.",
                        money(impact.current_projected_balance),
                        money(impact.next_projected_balance)
                    )))
                    .when(n_due > 0, |d| {
                        d.child(Button::new("all").label(format!("Confirm all {n_due}")).on_click(cx.listener(move |p, _, _, cx| p.confirm_due_now(due.clone(), cx))))
                    }),
            )
            .child(h_flex().gap_2().child(tab("Transactions", !self.ledger_tab, false, cx)).child(tab("Recent activity", self.ledger_tab, true, cx)))
            .when(!self.ledger_tab, |d| {
                d.child(chips)
                    .child(h_flex().gap_2().child(Input::new(&self.search)).child(Input::new(&self.min)).child(Input::new(&self.max)))
                    .child(h_flex().gap_2().child(div().text_sm().text_color(muted).child("Sort by")).child(sorts).child(
                        Button::new("clear").ghost().label("Clear filters").on_click(cx.listener(|p, _, w, cx| {
                            p.preset = None;
                            for i in [&p.search, &p.min, &p.max] {
                                i.update(cx, |i, cx| i.set_value("", w, cx));
                            }
                            cx.notify();
                        })),
                    ))
            })
            .child(list)
    }
}
