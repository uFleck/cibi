//! Accounts page (web/src/pages/accounts.tsx): account CRUD, set default, pay schedules, payday banner.
//! Account and schedule forms open in a sheet (accounts/form.rs); the delete confirmation stays inline.
mod form;

use crate::state::AppState;
use crate::views::ui::{amount_color, open_form_sheet};
use cibi_client::format::{format_money, parse_decimal_input};
use cibi_client::models::*;
use cibi_client::pay_schedule::parse_date_only_utc;
use cibi_client::{Client, Error};
use form::{num, text, AccountForm, SchedulesForm, CURRENCIES, FREQS};
use gpui_kit::component::{button::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

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
    account: Entity<AccountForm>,
    scheds: Entity<SchedulesForm>,
    confirm_delete: Option<String>,
    /// Default account's schedules (payday banner) and the account they were loaded for.
    banner: Vec<PayScheduleResponse>,
    banner_for: Option<String>,
}

fn default_badge(cx: &App) -> Div {
    div()
        .px_2()
        .rounded_sm()
        .text_xs()
        .font_weight(FontWeight::BOLD)
        .bg(cx.theme().primary)
        .text_color(cx.theme().primary_foreground)
        .child("Default")
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
        let page = cx.weak_entity();
        let mut p = Self {
            state,
            account: cx.new(|cx| AccountForm::new(page.clone(), w, cx)),
            scheds: cx.new(|cx| SchedulesForm::new(page, w, cx)),
            confirm_delete: None,
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
        if let Some(id) = self.scheds.read(cx).account.clone() {
            self.run(cx, false, move |c| c.list_pay_schedules(&id), |p, v, cx| {
                p.scheds.update(cx, |f, cx| {
                    f.schedules = v;
                    cx.notify();
                })
            });
        }
    }

    fn open_account(&mut self, acc: Option<&AccountResponse>, w: &mut Window, cx: &mut Context<Self>) {
        let form = self.account.clone();
        form.update(cx, |f, cx| f.load(acc, w, cx));
        open_form_sheet(w, cx, if acc.is_some() { "Edit account" } else { "New account" }, form);
    }

    fn submit_account(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let f = self.account.read(cx);
        let name = text(&f.name, cx);
        let (balance, buffer) = (num(&f.balance, cx), num(&f.buffer, cx));
        let err = if name.is_empty() {
            Some("Name is required")
        } else if balance.is_none() || buffer.is_none() {
            Some("Balance and safety buffer must be numbers")
        } else {
            None
        };
        let (editing, currency) = (f.editing.clone(), CURRENCIES[f.currency].to_string());
        if let Some(e) = err {
            return self.account.update(cx, |f, cx| f.fail(e, cx));
        }
        let (Some(balance), Some(buffer)) = (balance, buffer) else { return };
        window.close_sheet(cx);
        match editing {
            Some(id) => {
                let d = UpdateAccountRequest { name: Some(name), current_balance: Some(balance), currency: Some(currency), safety_buffer: Some(buffer) };
                self.run(cx, true, move |c| c.update_account(&id, &d).map(|_| ()), |_, _, _| {});
            }
            None => {
                let d = CreateAccountRequest { name, current_balance: balance, currency, safety_buffer: Some(buffer) };
                self.run(cx, true, move |c| c.create_account(&d).map(|_| ()), |_, _, _| {});
            }
        }
    }

    fn open_schedules(&mut self, acc: &AccountResponse, w: &mut Window, cx: &mut Context<Self>) {
        let scheds = self.scheds.clone();
        scheds.update(cx, |f, cx| f.open(acc, cx));
        self.reload(cx);
        open_form_sheet(w, cx, "Pay schedules", scheds);
    }

    fn submit_sched(&mut self, cx: &mut Context<Self>) {
        let f = self.scheds.read(cx);
        let (Some(editing), Some(account_id)) = (f.form.clone(), f.account.clone()) else { return };
        let anchor = text(&f.anchor, cx);
        let amount = parse_decimal_input(&text(&f.amount, cx)).filter(|a| *a > 0.0);
        let frequency = FREQS[f.freq].to_string();
        let semi = frequency == "semi-monthly";
        let day2 = text(&f.day2, cx).parse::<i64>().ok().filter(|d| (1..=31).contains(d));
        let label = Some(text(&f.label, cx)).filter(|l| !l.is_empty());
        let err = if parse_date_only_utc(&anchor).is_none() {
            Some("Anchor date must be YYYY-MM-DD")
        } else if amount.is_none() {
            Some("Amount must be a positive number")
        } else if semi && day2.is_none() {
            Some("Second day must be 1-31")
        } else {
            None
        };
        if let Some(e) = err {
            return self.scheds.update(cx, |f, cx| f.fail(e, cx));
        }
        let Some(amount) = amount else { return };
        let day_of_month_2 = if semi { day2 } else { None };
        self.scheds.update(cx, |f, cx| {
            f.form = None;
            f.error = None;
            cx.notify();
        });
        match editing {
            Some(id) => {
                let d = UpdatePayScheduleRequest { frequency, anchor_date: anchor, amount, day_of_month_2, label };
                self.run(cx, true, move |c| c.update_pay_schedule(&id, &d), |_, _, _| {});
            }
            None => {
                let d = CreatePayScheduleRequest { account_id, frequency, anchor_date: anchor, amount, day_of_month_2, label };
                self.run(cx, true, move |c| c.create_pay_schedule(&d).map(|_| ()), |_, _, _| {});
            }
        }
    }

    fn account_row(&mut self, a: &AccountResponse, cx: &mut Context<Self>) -> impl IntoElement {
        let id = a.id.clone();
        let confirming = self.confirm_delete.as_ref() == Some(&id);
        let (acc, sched_acc) = (a.clone(), a.clone());
        let (i1, i3) = (id.clone(), id.clone());
        let balance = amount_color(cx, a.current_balance);
        h_flex()
            .gap_2()
            .p_3()
            .border_1()
            .rounded_lg()
            .child(
                h_flex()
                    .flex_1()
                    .gap_2()
                    .child(div().font_weight(FontWeight::SEMIBOLD).child(a.name.clone()))
                    .when(a.is_default, |r| r.child(default_badge(cx))),
            )
            .child(div().text_color(balance).child(format_money(a.current_balance, &a.currency)))
            .child(div().text_sm().text_color(cx.theme().muted_foreground).child(format!("buffer {}", format_money(a.safety_buffer, &a.currency))))
            .when(!a.is_default, |r| {
                r.child(Button::new(SharedString::from(format!("def{id}"))).compact().outline().label("Set default").on_click(cx.listener(move |p, _, _, cx| {
                    let id = i1.clone();
                    p.run(cx, true, move |c| c.set_default_account(&id), |_, _, _| {});
                })))
            })
            .child(Button::new(SharedString::from(format!("sch{id}"))).compact().outline().label("Schedules").on_click(cx.listener(move |p, _, w, cx| p.open_schedules(&sched_acc, w, cx))))
            .child(Button::new(SharedString::from(format!("edit{id}"))).compact().outline().label("Edit").on_click(cx.listener(move |p, _, w, cx| p.open_account(Some(&acc), w, cx))))
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
            )))
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
                    .child(Button::new("add").label("New account").on_click(cx.listener(|p, _, w, cx| p.open_account(None, w, cx)))),
            )
            .when_some(payday, |r, d| r.child(div().p_2().border_1().rounded_lg().child(format!("Next payday: {}", d.format("%Y-%m-%d")))))
            .children(accounts.iter().map(|a| self.account_row(a, cx)))
    }
}
