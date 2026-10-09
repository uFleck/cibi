//! Accounts page (web/src/pages/accounts.tsx): account CRUD, set default, pay schedules, payday banner.
//! Forms and the delete confirmation are inline panels, not modals.
use crate::state::AppState;
use cibi_client::format::{format_money, parse_decimal_input, to_date_input_value};
use cibi_client::models::*;
use cibi_client::pay_schedule::parse_date_only_utc;
use cibi_client::{Client, Error};
use gpui_kit::component::{button::*, input::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

const CURRENCIES: [&str; 12] = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "MXN", "BRL", "INR", "SGD", "HKD"];
const FREQS: [&str; 4] = ["weekly", "bi-weekly", "semi-monthly", "monthly"];

/// Thin wrapper: the shell builds `Accounts { state }`; the real view (which needs a `Window` for its inputs) is created lazily.
pub struct Accounts {
    pub state: Entity<AppState>,
}

impl Render for Accounts {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let state = self.state.clone();
        window.use_keyed_state("accounts-page", cx, |w, cx| Page::new(state, w, cx))
    }
}

struct Page {
    state: Entity<AppState>,
    name: Entity<InputState>,
    balance: Entity<InputState>,
    buffer: Entity<InputState>,
    currency: usize,
    /// None = closed, Some(None) = creating, Some(Some(id)) = editing.
    form: Option<Option<String>>,
    confirm_delete: Option<String>,
    /// Account whose schedules panel is open, and its schedules.
    sched_account: Option<String>,
    schedules: Vec<PayScheduleResponse>,
    sform: Option<Option<String>>,
    label: Entity<InputState>,
    anchor: Entity<InputState>,
    amount: Entity<InputState>,
    day2: Entity<InputState>,
    freq: usize,
    /// Default account's schedules (payday banner) and the account they were loaded for.
    banner: Vec<PayScheduleResponse>,
    banner_for: Option<String>,
}

fn input(placeholder: &str, w: &mut Window, cx: &mut Context<Page>) -> Entity<InputState> {
    let i = cx.new(|cx| InputState::new(w, cx));
    i.update(cx, |i, cx| i.set_placeholder(placeholder.to_string(), w, cx));
    i
}

fn set(i: &Entity<InputState>, v: &str, w: &mut Window, cx: &mut Context<Page>) {
    i.update(cx, |i, cx| i.set_value(v.to_string(), w, cx));
}

fn text(i: &Entity<InputState>, cx: &App) -> String {
    i.read(cx).value().trim().to_string()
}

fn field(label: &str, i: &Entity<InputState>) -> impl IntoElement {
    v_flex().gap_1().child(div().text_xs().child(label.to_string())).child(Input::new(i))
}

fn choice(id: &str, items: &[&str], sel: usize, on: impl Fn(&mut Page, usize, &mut Context<Page>) + Clone + 'static, cx: &mut Context<Page>) -> impl IntoElement {
    h_flex().gap_1().flex_wrap().children(items.iter().enumerate().map(|(n, c)| {
        let on = on.clone();
        let b = Button::new(SharedString::from(format!("{id}{c}"))).compact().label(c.to_string());
        let b = if n == sel { b.primary() } else { b.outline() };
        b.on_click(cx.listener(move |p, _, _, cx| on(p, n, cx)))
    }))
}

fn panel(title: &str) -> Div {
    v_flex().gap_2().p_4().border_1().rounded_lg().child(div().font_weight(FontWeight::SEMIBOLD).child(title.to_string()))
}

impl Page {
    fn new(state: Entity<AppState>, w: &mut Window, cx: &mut Context<Self>) -> Self {
        // Reload the payday banner whenever the default account changes.
        cx.observe(&state, |p, _, cx| {
            if p.default_id(cx) != p.banner_for {
                p.reload(cx);
            }
        })
        .detach();
        let mut p = Self {
            state,
            name: input("Account name", w, cx),
            balance: input("0.00", w, cx),
            buffer: input("0.00", w, cx),
            currency: CURRENCIES.iter().position(|c| *c == "BRL").unwrap(),
            form: None,
            confirm_delete: None,
            sched_account: None,
            schedules: vec![],
            sform: None,
            label: input("Label (optional)", w, cx),
            anchor: input("YYYY-MM-DD", w, cx),
            amount: input("0.00", w, cx),
            day2: input("Second day of month", w, cx),
            freq: 3,
            banner: vec![],
            banner_for: None,
        };
        p.reload(cx);
        p
    }

    fn default_id(&self, cx: &App) -> Option<String> {
        let accounts = &self.state.read(cx).accounts;
        accounts.iter().find(|a| a.is_default).or(accounts.first()).map(|a| a.id.clone())
    }

    /// Run `call` through AppState::fetch, then `done` on this page. `mutate` also refreshes accounts and schedules.
    fn run<T: Send + 'static>(
        &mut self,
        cx: &mut Context<Self>,
        mutate: bool,
        call: impl FnOnce(Client) -> Result<T, Error> + Send + 'static,
        done: impl FnOnce(&mut Self, T, &mut Context<Self>) + 'static,
    ) {
        let page = cx.entity();
        self.state.clone().update(cx, |s, cx| {
            s.fetch(cx, call, move |s, v, cx| {
                if mutate {
                    s.refresh_accounts(cx);
                }
                page.update(cx, |p, cx| {
                    done(p, v, cx);
                    if mutate {
                        p.reload(cx);
                    }
                });
            })
        });
    }

    fn reload(&mut self, cx: &mut Context<Self>) {
        self.banner_for = self.default_id(cx);
        if let Some(id) = self.banner_for.clone() {
            self.run(cx, false, move |c| c.list_pay_schedules(&id), |p, v, _| p.banner = v);
        }
        if let Some(id) = self.sched_account.clone() {
            self.run(cx, false, move |c| c.list_pay_schedules(&id), |p, v, _| p.schedules = v);
        }
    }

    fn err(&self, msg: &str, cx: &mut Context<Self>) {
        let msg = msg.to_string();
        self.state.update(cx, |s, cx| {
            s.error = Some(msg);
            cx.notify();
        });
    }

    fn open_form(&mut self, acc: Option<&AccountResponse>, w: &mut Window, cx: &mut Context<Self>) {
        self.form = Some(acc.map(|a| a.id.clone()));
        set(&self.name, acc.map_or("", |a| &a.name), w, cx);
        set(&self.balance, &acc.map_or("0".into(), |a| a.current_balance.to_string()), w, cx);
        set(&self.buffer, &acc.map_or("0".into(), |a| a.safety_buffer.to_string()), w, cx);
        self.currency = CURRENCIES.iter().position(|c| Some(*c) == acc.map(|a| a.currency.as_str())).unwrap_or(8);
        cx.notify();
    }

    fn save_account(&mut self, cx: &mut Context<Self>) {
        let Some(editing) = self.form.clone() else { return };
        let name = text(&self.name, cx);
        if name.is_empty() {
            return self.err("Name is required", cx);
        }
        let num = |i: &Entity<InputState>| match text(i, cx).as_str() {
            "" => Some(0.0),
            t => parse_decimal_input(t),
        };
        let (Some(balance), Some(buffer)) = (num(&self.balance), num(&self.buffer)) else {
            return self.err("Balance and safety buffer must be numbers", cx);
        };
        let currency = CURRENCIES[self.currency].to_string();
        let done = |p: &mut Self, _: (), cx: &mut Context<Self>| {
            p.form = None;
            cx.notify();
        };
        match editing {
            Some(id) => {
                let d = UpdateAccountRequest { name: Some(name), current_balance: Some(balance), currency: Some(currency), safety_buffer: Some(buffer) };
                self.run(cx, true, move |c| c.update_account(&id, &d).map(|_| ()), done);
            }
            None => {
                let d = CreateAccountRequest { name, current_balance: balance, currency, safety_buffer: Some(buffer) };
                self.run(cx, true, move |c| c.create_account(&d).map(|_| ()), done);
            }
        }
    }

    fn open_sform(&mut self, ps: Option<&PayScheduleResponse>, w: &mut Window, cx: &mut Context<Self>) {
        self.sform = Some(ps.map(|p| p.id.clone()));
        set(&self.label, ps.and_then(|p| p.label.as_deref()).unwrap_or(""), w, cx);
        set(&self.anchor, &to_date_input_value(ps.map(|p| p.anchor_date.as_str())), w, cx);
        set(&self.amount, &ps.map_or(String::new(), |p| p.amount.to_string()), w, cx);
        set(&self.day2, &ps.and_then(|p| p.day_of_month_2).map_or(String::new(), |d| d.to_string()), w, cx);
        self.freq = ps.and_then(|p| FREQS.iter().position(|f| *f == p.frequency)).unwrap_or(3);
        cx.notify();
    }

    fn save_sched(&mut self, cx: &mut Context<Self>) {
        let (Some(editing), Some(account_id)) = (self.sform.clone(), self.sched_account.clone()) else { return };
        let anchor = text(&self.anchor, cx);
        if parse_date_only_utc(&anchor).is_none() {
            return self.err("Anchor date must be YYYY-MM-DD", cx);
        }
        let Some(amount) = parse_decimal_input(&text(&self.amount, cx)).filter(|a| *a > 0.0) else {
            return self.err("Amount must be a positive number", cx);
        };
        let frequency = FREQS[self.freq].to_string();
        let day_of_month_2 = if frequency == "semi-monthly" { text(&self.day2, cx).parse::<i64>().ok().filter(|d| (1..=31).contains(d)) } else { None };
        if frequency == "semi-monthly" && day_of_month_2.is_none() {
            return self.err("Second day must be 1-31", cx);
        }
        let label = Some(text(&self.label, cx)).filter(|l| !l.is_empty());
        let done = |p: &mut Self, _: (), cx: &mut Context<Self>| {
            p.sform = None;
            cx.notify();
        };
        match editing {
            Some(id) => {
                let d = UpdatePayScheduleRequest { frequency, anchor_date: anchor, amount, day_of_month_2, label };
                self.run(cx, true, move |c| c.update_pay_schedule(&id, &d), done);
            }
            None => {
                let d = CreatePayScheduleRequest { account_id, frequency, anchor_date: anchor, amount, day_of_month_2, label };
                self.run(cx, true, move |c| c.create_pay_schedule(&d).map(|_| ()), done);
            }
        }
    }

    fn account_row(&mut self, a: &AccountResponse, cx: &mut Context<Self>) -> impl IntoElement {
        let id = a.id.clone();
        let open = self.sched_account.as_ref() == Some(&id);
        let confirming = self.confirm_delete.as_ref() == Some(&id);
        let acc = a.clone();
        let (i1, i2, i3) = (id.clone(), id.clone(), id.clone());
        v_flex()
            .gap_2()
            .p_3()
            .border_1()
            .rounded_lg()
            .child(
                h_flex()
                    .gap_2()
                    .child(div().flex_1().font_weight(FontWeight::SEMIBOLD).child(format!("{}{}", a.name, if a.is_default { " (default)" } else { "" })))
                    .child(format!("{}  buffer {}", format_money(a.current_balance, &a.currency), format_money(a.safety_buffer, &a.currency)))
                    .when(!a.is_default, |r| {
                        r.child(Button::new(SharedString::from(format!("def{id}"))).compact().outline().label("Set default").on_click(cx.listener(move |p, _, _, cx| {
                            let id = i1.clone();
                            p.run(cx, true, move |c| c.set_default_account(&id), |_, _, _| {});
                        })))
                    })
                    .child(Button::new(SharedString::from(format!("sch{id}"))).compact().outline().label("Schedules").on_click(cx.listener(move |p, _, _, cx| {
                        p.sform = None;
                        p.schedules.clear();
                        p.sched_account = if open { None } else { Some(i2.clone()) };
                        p.reload(cx);
                        cx.notify();
                    })))
                    .child(Button::new(SharedString::from(format!("edit{id}"))).compact().outline().label("Edit").on_click(cx.listener(move |p, _, w, cx| p.open_form(Some(&acc), w, cx))))
                    .child(Button::new(SharedString::from(format!("del{id}"))).compact().outline().label(if confirming { "Confirm delete" } else { "Delete" }).on_click(cx.listener(
                        move |p, _, _, cx| {
                            if p.confirm_delete.as_ref() == Some(&i3) {
                                p.confirm_delete = None;
                                let id = i3.clone();
                                p.run(cx, true, move |c| c.delete_account(&id), |_, _, _| {});
                            } else {
                                p.confirm_delete = Some(i3.clone());
                                cx.notify();
                            }
                        },
                    ))),
            )
            .when(open, |r| r.child(self.schedules_panel(cx)))
    }

    fn schedules_panel(&mut self, cx: &mut Context<Self>) -> impl IntoElement {
        let cur = self.state.read(cx).accounts.iter().find(|a| Some(&a.id) == self.sched_account.as_ref()).map_or("BRL".to_string(), |a| a.currency.clone());
        let rows: Vec<_> = self.schedules.clone();
        v_flex()
            .gap_2()
            .children(rows.into_iter().map(|s| {
                let (a, b, c) = (s.clone(), s.id.clone(), s.id.clone());
                h_flex()
                    .gap_2()
                    .child(div().flex_1().child(format!(
                        "{} {} from {}{} · next {}",
                        s.label.clone().unwrap_or_default(),
                        s.frequency,
                        s.anchor_date.get(..10).unwrap_or(&s.anchor_date),
                        s.day_of_month_2.map_or(String::new(), |d| format!(" & day {d}")),
                        s.next_payday.get(..10).unwrap_or(&s.next_payday)
                    )))
                    .child(format_money(s.amount, &cur))
                    .child(Button::new(SharedString::from(format!("cf{b}"))).compact().outline().label("Confirm").on_click(cx.listener(move |p, _, _, cx| {
                        let id = b.clone();
                        p.run(cx, true, move |c| c.confirm_pay_schedule(&id).map(|_| ()), |_, _, _| {});
                    })))
                    .child(Button::new(SharedString::from(format!("se{}", a.id))).compact().outline().label("Edit").on_click(cx.listener(move |p, _, w, cx| p.open_sform(Some(&a), w, cx))))
                    .child(Button::new(SharedString::from(format!("sd{c}"))).compact().outline().label("Delete").on_click(cx.listener(move |p, _, _, cx| {
                        let id = c.clone();
                        p.run(cx, true, move |c| c.delete_pay_schedule(&id), |_, _, _| {});
                    })))
            }))
            .child(Button::new("sadd").compact().label("Add schedule").on_click(cx.listener(|p, _, w, cx| p.open_sform(None, w, cx))))
            .when(self.sform.is_some(), |r| {
                let title = if self.sform.as_ref().is_some_and(|f| f.is_some()) { "Edit pay schedule" } else { "New pay schedule" };
                r.child(
                    panel(title)
                        .child(choice("fq", &FREQS, self.freq, |p, n, cx| { p.freq = n; cx.notify() }, cx))
                        .child(field("Label", &self.label))
                        .child(field("Anchor date (YYYY-MM-DD)", &self.anchor))
                        .child(field("Amount", &self.amount))
                        .when(FREQS[self.freq] == "semi-monthly", |r| r.child(field("Second day of month", &self.day2)))
                        .child(
                            h_flex()
                                .gap_2()
                                .child(Button::new("ssave").label("Save").on_click(cx.listener(|p, _, _, cx| p.save_sched(cx))))
                                .child(Button::new("scancel").outline().label("Cancel").on_click(cx.listener(|p, _, _, cx| {
                                    p.sform = None;
                                    cx.notify();
                                }))),
                        ),
                )
            })
    }
}

impl Render for Page {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let accounts = self.state.read(cx).accounts.clone();
        let payday = cibi_client::pay_schedule::earliest_payday_after(&self.banner, chrono::Utc::now());
        v_flex()
            .gap_3()
            .p_4()
            .size_full()
            .overflow_hidden()
            .child(
                h_flex()
                    .gap_2()
                    .child(div().flex_1().text_xl().font_weight(FontWeight::BOLD).child("Accounts"))
                    .child(Button::new("add").label("New account").on_click(cx.listener(|p, _, w, cx| p.open_form(None, w, cx)))),
            )
            .when_some(payday, |r, d| r.child(div().p_2().border_1().rounded_lg().child(format!("Next payday: {}", d.format("%Y-%m-%d")))))
            .when(self.form.is_some(), |r| {
                let title = if self.form.as_ref().is_some_and(|f| f.is_some()) { "Edit account" } else { "New account" };
                r.child(
                    panel(title)
                        .child(field("Name", &self.name))
                        .child(field("Balance", &self.balance))
                        .child(field("Safety buffer", &self.buffer))
                        .child(choice("cur", &CURRENCIES, self.currency, |p, n, cx| { p.currency = n; cx.notify() }, cx))
                        .child(
                            h_flex()
                                .gap_2()
                                .child(Button::new("save").label("Save").on_click(cx.listener(|p, _, _, cx| p.save_account(cx))))
                                .child(Button::new("cancel").outline().label("Cancel").on_click(cx.listener(|p, _, _, cx| {
                                    p.form = None;
                                    cx.notify();
                                }))),
                        ),
                )
            })
            .children(accounts.iter().map(|a| self.account_row(a, cx)))
    }
}
