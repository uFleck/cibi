//! Goals page (web/src/pages/goals.tsx): tracking, CRUD, ledger add/reverse, recurring confirm.
//! Goal and ledger forms open in a sheet (goals/form.rs).
mod form;

use crate::state::AppState;
use crate::views::ui::open_form_sheet;
use cibi_client::{format::*, models::*, Client, Error};
use form::{GoalForm, Mode};
use gpui_kit::component::{button::*, input::InputState, progress::Progress, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

/// Shell builds `Goals { state }`; the real view lives in keyed state so it can own inputs (needs a Window).
pub struct Goals {
    pub state: Entity<AppState>,
}

impl Render for Goals {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let state = self.state.clone();
        window.use_keyed_state("goals-page", cx, |w, cx| Page::new(state, w, cx))
    }
}

struct Page {
    state: Entity<AppState>,
    loaded: Option<String>,
    tracking: Option<GoalsTrackingResponse>,
    recurring: Vec<GoalRecurringDueItemResponse>,
    form: Entity<GoalForm>,
}

fn card(cx: &App) -> Div {
    v_flex().gap_1().p_3().border_1().border_color(cx.theme().border).rounded_md()
}

fn bold(s: impl Into<SharedString>) -> Div {
    div().font_weight(FontWeight::BOLD).child(s.into())
}

impl Page {
    fn new(state: Entity<AppState>, w: &mut Window, cx: &mut Context<Self>) -> Self {
        let page = cx.weak_entity();
        Self {
            state,
            loaded: None,
            tracking: None,
            recurring: vec![],
            form: cx.new(|cx| GoalForm::new(page, w, cx)),
        }
    }

    fn currency(&self, cx: &App) -> String {
        let st = self.state.read(cx);
        st.accounts.iter().find(|a| Some(&a.id) == st.selected.as_ref()).map_or("BRL".to_string(), |a| a.currency.clone())
    }

    /// Blocking call on the background executor (AppState::fetch pattern, but `done` gets this view).
    fn run<T: Send + 'static>(
        &mut self,
        cx: &mut Context<Self>,
        call: impl FnOnce(Client) -> Result<T, Error> + Send + 'static,
        done: impl FnOnce(&mut Self, T, &mut Context<Self>) + 'static,
    ) {
        let client = self.state.read(cx).client.clone();
        cx.spawn(async move |this, cx| {
            let res = cx.background_spawn(async move { call(client) }).await;
            this.update(cx, |s, cx| match res {
                Ok(v) => done(s, v, cx),
                Err(e) => s.fail(cx, e.to_string()),
            })
            .ok();
        })
        .detach();
    }

    /// Park an error for the shell's toast.
    fn fail(&mut self, cx: &mut Context<Self>, msg: String) {
        self.state.update(cx, |st, cx| {
            st.error = Some(msg);
            cx.notify();
        });
    }

    fn reload(&mut self, cx: &mut Context<Self>) {
        let Some(acc) = self.state.read(cx).selected.clone() else { return };
        let open = match &self.form.read(cx).mode {
            Mode::History(id) => Some(id.clone()),
            _ => None,
        };
        self.run(
            cx,
            move |c| {
                let ledger = open.map_or(Ok(vec![]), |id| c.list_goal_ledger(&id))?;
                Ok((c.fetch_goals_tracking(&acc)?, c.list_goal_recurring(&acc)?, ledger))
            },
            |s, (t, r, l), cx| {
                (s.tracking, s.recurring) = (Some(t), r);
                s.form.update(cx, |f, cx| {
                    f.ledger = l;
                    cx.notify();
                });
                cx.notify();
            },
        );
    }

    /// Run a write, then reload (the sheet is closed by the caller, or stays open for ledger reversals).
    fn mutate(&mut self, cx: &mut Context<Self>, call: impl FnOnce(Client) -> Result<(), Error> + Send + 'static) {
        self.run(cx, call, |s, _, cx| s.reload(cx));
    }

    fn open(&mut self, mode: Mode, g: Option<&GoalsTrackingGoalResponse>, w: &mut Window, cx: &mut Context<Self>) {
        let title = match mode {
            Mode::New => "New goal",
            Mode::Edit(_) => "Edit goal",
            Mode::Add(_) => "Add money",
            Mode::Remove(_) => "Remove money",
            Mode::History(_) | Mode::None => "Ledger",
        };
        let history = matches!(mode, Mode::History(_));
        let cur = self.currency(cx);
        let form = self.form.clone();
        form.update(cx, |f, cx| f.load(mode, g, &cur, w, cx));
        if history {
            self.reload(cx);
        }
        open_form_sheet(w, cx, title, form);
    }

    fn submit(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        let f = self.form.read(cx);
        let v = |i: &Entity<InputState>| i.read(cx).value().trim().to_string();
        let (name, note, mode) = (v(&f.name), v(&f.note), f.mode.clone());
        let target = parse_decimal_input(&v(&f.target)).filter(|t| *t > 0.0);
        let min = match v(&f.min) {
            s if s.is_empty() => Some(0.0),
            s => parse_decimal_input(&s).filter(|m| *m >= 0.0),
        };
        let amount = parse_decimal_input(&v(&f.amount)).filter(|a| *a > 0.0);
        let err = match &mode {
            Mode::New | Mode::Edit(_) if name.is_empty() || target.is_none() || min.is_none() => Some("Enter a name, a target > 0 and a valid minimum"),
            Mode::Add(_) | Mode::Remove(_) if amount.is_none() => Some("Enter an amount > 0"),
            Mode::Remove(_) if note.is_empty() => Some("A reason is required"),
            _ => None,
        };
        if let Some(e) = err {
            return self.form.update(cx, |f, cx| f.fail(e, cx));
        }
        let acc = self.state.read(cx).selected.clone();
        let add = matches!(mode, Mode::Add(_));
        w.close_sheet(cx);
        match mode {
            Mode::New => {
                let Some(account_id) = acc else { return };
                let d = CreateGoalRequest {
                    account_id,
                    name,
                    target_amount: target.unwrap(),
                    start_date_utc: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                    min_contribution_per_window: min,
                    ..Default::default()
                };
                self.mutate(cx, move |c| c.create_goal(&d).map(|_| ()));
            }
            Mode::Edit(id) => {
                let d = UpdateGoalRequest { name: Some(name), target_amount: target, min_contribution_per_window: min, ..Default::default() };
                self.mutate(cx, move |c| c.update_goal(&id, &d));
            }
            Mode::Add(id) | Mode::Remove(id) => {
                let d = AddGoalLedgerRequest {
                    amount: amount.unwrap(),
                    r#type: if add { "contribution" } else { "withdrawal" }.into(),
                    source: Some("manual".into()),
                    note: (!add).then_some(note),
                };
                self.mutate(cx, move |c| c.add_goal_ledger_entry(&id, &d).map(|_| ()));
            }
            Mode::History(_) | Mode::None => {}
        }
    }
}

impl Render for Page {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let sel = self.state.read(cx).selected.clone();
        let cur = self.currency(cx);
        if sel != self.loaded {
            self.loaded = sel;
            self.tracking = None;
            self.reload(cx);
        }
        let mut page = v_flex().id("goals").size_full().overflow_y_scroll().p_6().gap_3().child(
            h_flex()
                .justify_between()
                .child(div().text_xl().font_weight(FontWeight::BOLD).child("Goals"))
                .child(Button::new("new").primary().label("New goal").disabled(self.state.read(cx).selected.is_none()).on_click(cx.listener(|s, _, w, cx| s.open(Mode::New, None, w, cx)))),
        );
        let Some(t) = self.tracking.clone() else { return page.child("Loading…") };
        let sm = &t.summary;
        page = page.child(format!(
            "{} goals · {} completed · invested {} · remaining {}",
            sm.goals_count,
            sm.completed_count,
            format_money(sm.total_invested, &cur),
            format_money(sm.total_remaining, &cur)
        ));
        if !self.recurring.is_empty() {
            let rows = self.recurring.iter().map(|r| {
                let id = r.id.clone();
                h_flex()
                    .gap_3()
                    .child(format!(
                        "{} · {} {} · due {}{}",
                        r.goal_name,
                        format_money(r.amount, &cur),
                        r.frequency,
                        format_date(&r.next_due_utc),
                        if r.is_overdue { " (overdue)" } else { "" }
                    ))
                    .child(Button::new(SharedString::from(format!("rc-{}", r.id))).small().primary().label("Confirm").on_click(cx.listener(
                        move |s, _, _, cx| {
                            let id = id.clone();
                            s.mutate(cx, move |c| c.confirm_goal_recurring(&id));
                        },
                    )))
            });
            page = page.child(card(cx).child(bold("Recurring contributions due")).children(rows));
        }
        if t.top_goals.is_empty() {
            page = page.child("No goals yet. Create one to track contributions and progress.");
        }
        for g in t.top_goals {
            let pct = if g.progress_pct.is_finite() { g.progress_pct.clamp(0.0, 100.0) } else { 0.0 };
            let done = g.status == "completed";
            let btn = |label: &'static str, key: &'static str, mode: Mode, cx: &mut Context<Self>| {
                let g = g.clone();
                Button::new(SharedString::from(format!("{key}-{}", g.id))).small().outline().label(label).on_click(cx.listener(
                    move |s, _, w, cx| s.open(mode.clone(), (key == "edit").then_some(&g), w, cx),
                ))
            };
            let row = h_flex()
                .gap_2()
                .child(btn("Add money", "add", Mode::Add(g.id.clone()), cx))
                .child(btn("Remove money", "rm", Mode::Remove(g.id.clone()), cx))
                .child(btn("Edit", "edit", Mode::Edit(g.id.clone()), cx))
                .child(btn("Ledger", "hist", Mode::History(g.id.clone()), cx));
            let (success, muted, gold) = (cx.theme().success, cx.theme().muted_foreground, cx.theme().primary);
            page = page.child(
                card(cx)
                    .child(h_flex().justify_between().child(bold(g.name.clone())).child(format!(
                        "{pct:.1}% · {} of {}",
                        format_money(g.invested_total, &cur),
                        format_money(g.target_amount, &cur)
                    )))
                    .child(Progress::new(SharedString::from(format!("p-{}", g.id))).value(pct as f32).color(if done { success } else { gold }))
                    .when(done, |d| d.child(div().text_sm().text_color(success).child("Completed")))
                    .child(div().text_sm().text_color(muted).child(format!("Remaining {}", format_money(g.remaining_amount, &cur))))
                    .child(row),
            );
        }
        page
    }
}
