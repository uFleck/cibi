//! Goals page (web/src/pages/goals.tsx): tracking, CRUD, ledger add/reverse, recurring confirm.
use crate::state::AppState;
use cibi_client::{format::*, models::*, Client, Error};
use gpui_kit::component::{button::*, input::*, progress::Progress, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;
use std::collections::HashSet;

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

#[derive(Clone, PartialEq)]
enum Mode {
    None,
    New,
    Edit(String),
    Add(String),
    Remove(String),
    History(String),
}

struct Page {
    state: Entity<AppState>,
    loaded: Option<String>,
    tracking: Option<GoalsTrackingResponse>,
    recurring: Vec<GoalRecurringDueItemResponse>,
    ledger: Vec<GoalLedgerEntryResponse>,
    mode: Mode,
    name: Entity<InputState>,
    target: Entity<InputState>,
    min: Entity<InputState>,
    amount: Entity<InputState>,
    note: Entity<InputState>,
}

fn input(ph: &str, w: &mut Window, cx: &mut Context<Page>) -> Entity<InputState> {
    cx.new(|cx| InputState::new(w, cx).placeholder(ph.to_string()))
}

fn card(cx: &App) -> Div {
    v_flex().gap_1().p_3().border_1().border_color(cx.theme().border).rounded_md()
}

fn bold(s: impl Into<SharedString>) -> Div {
    div().font_weight(FontWeight::BOLD).child(s.into())
}

impl Page {
    fn new(state: Entity<AppState>, w: &mut Window, cx: &mut Context<Self>) -> Self {
        Self {
            state,
            loaded: None,
            tracking: None,
            recurring: vec![],
            ledger: vec![],
            mode: Mode::None,
            name: input("Trip, emergency fund...", w, cx),
            target: input("Target amount, e.g. 1500.00", w, cx),
            min: input("Min contribution per window (empty = none)", w, cx),
            amount: input("Amount, e.g. 50.00", w, cx),
            note: input("Reason", w, cx),
        }
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
        let open = match &self.mode {
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
                (s.tracking, s.recurring, s.ledger) = (Some(t), r, l);
                cx.notify();
            },
        );
    }

    /// Run a write, then close the form (the ledger panel stays) and reload.
    fn mutate(&mut self, cx: &mut Context<Self>, call: impl FnOnce(Client) -> Result<(), Error> + Send + 'static) {
        self.run(cx, call, |s, _, cx| {
            if !matches!(s.mode, Mode::History(_)) {
                s.mode = Mode::None;
            }
            s.reload(cx);
        });
    }

    fn open(&mut self, mode: Mode, g: Option<&GoalsTrackingGoalResponse>, w: &mut Window, cx: &mut Context<Self>) {
        let vals = [
            (&self.name, g.map_or(String::new(), |g| g.name.clone())),
            (&self.target, g.map_or(String::new(), |g| g.target_amount.to_string())),
            (&self.min, g.map_or(String::new(), |g| g.min_contribution_per_window.unwrap_or(0.0).to_string())),
            (&self.amount, String::new()),
            (&self.note, String::new()),
        ];
        for (i, v) in vals {
            i.update(cx, |i, cx| i.set_value(v, w, cx));
        }
        self.mode = mode;
        if let Mode::History(_) = self.mode {
            self.ledger.clear();
            self.reload(cx);
        }
        cx.notify();
    }

    fn submit(&mut self, cx: &mut Context<Self>) {
        let v = |i: &Entity<InputState>| i.read(cx).value().trim().to_string();
        let (name, note) = (v(&self.name), v(&self.note));
        let target = parse_decimal_input(&v(&self.target)).filter(|t| *t > 0.0);
        let min = match v(&self.min) {
            s if s.is_empty() => Some(0.0),
            s => parse_decimal_input(&s).filter(|m| *m >= 0.0),
        };
        let amount = parse_decimal_input(&v(&self.amount)).filter(|a| *a > 0.0);
        let acc = self.state.read(cx).selected.clone();
        match self.mode.clone() {
            Mode::New | Mode::Edit(_) if name.is_empty() || target.is_none() || min.is_none() => {
                self.fail(cx, "Enter a name, a target > 0 and a valid minimum".into())
            }
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
            Mode::Add(_) | Mode::Remove(_) if amount.is_none() => self.fail(cx, "Enter an amount > 0".into()),
            Mode::Remove(_) if note.is_empty() => self.fail(cx, "A reason is required".into()),
            Mode::Add(id) | Mode::Remove(id) => {
                let add = matches!(self.mode, Mode::Add(_));
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

    fn form(&self, cx: &mut Context<Self>) -> Option<Div> {
        let goal = vec![("Name", &self.name), ("Target", &self.target), ("Min contribution / window", &self.min)];
        let (title, fields) = match &self.mode {
            Mode::New => ("New goal", goal),
            Mode::Edit(_) => ("Edit goal", goal),
            Mode::Add(_) => ("Add money", vec![("Amount", &self.amount)]),
            Mode::Remove(_) => ("Remove money", vec![("Amount", &self.amount), ("Reason", &self.note)]),
            _ => return None,
        };
        Some(
            card(cx)
                .gap_2()
                .child(bold(title))
                .children(fields.into_iter().map(|(l, i)| v_flex().gap_1().child(l).child(Input::new(i))))
                .child(
                    h_flex()
                        .gap_2()
                        .child(Button::new("submit").primary().label("Save").on_click(cx.listener(|s, _, _, cx| s.submit(cx))))
                        .child(Button::new("cancel").ghost().label("Cancel").on_click(cx.listener(|s, _, _, cx| {
                            s.mode = Mode::None;
                            cx.notify();
                        }))),
                ),
        )
    }

    fn history(&self, goal_id: &str, cur: &str, cx: &mut Context<Self>) -> Div {
        let reversed: HashSet<&str> = self.ledger.iter().filter_map(|e| e.reverses_entry_id.as_deref()).collect();
        let rows = self.ledger.iter().map(|e| {
            let (gid, eid) = (goal_id.to_string(), e.id.clone());
            let is_reversed = reversed.contains(e.id.as_str());
            h_flex()
                .gap_3()
                .child(format!("{} · {} · {}", format_date(&e.timestamp_utc), e.r#type, e.source))
                .child(format_money(e.amount, cur))
                .when(is_reversed, |d| d.child("reversed"))
                .when(e.reverses_entry_id.is_none() && !is_reversed, |d| {
                    d.child(Button::new(SharedString::from(format!("rev-{}", e.id))).small().outline().label("Reverse").on_click(
                        cx.listener(move |s, _, _, cx| {
                            let (g, e) = (gid.clone(), eid.clone());
                            s.mutate(cx, move |c| c.reverse_goal_ledger_entry(&g, &e).map(|_| ()));
                        }),
                    ))
                })
        });
        card(cx).child(bold("Ledger")).children(rows).when(self.ledger.is_empty(), |d| d.child("No entries."))
    }
}

impl Render for Page {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let st = self.state.read(cx);
        let sel = st.selected.clone();
        let cur = st.accounts.iter().find(|a| Some(&a.id) == sel.as_ref()).map_or("BRL".to_string(), |a| a.currency.clone());
        if sel != self.loaded {
            self.loaded = sel.clone();
            self.mode = Mode::None;
            self.tracking = None;
            self.reload(cx);
        }
        let mut page = v_flex().id("goals").size_full().overflow_y_scroll().p_6().gap_3().child(
            h_flex()
                .justify_between()
                .child(div().text_xl().font_weight(FontWeight::BOLD).child("Goals"))
                .child(Button::new("new").primary().label("New goal").disabled(sel.is_none()).on_click(cx.listener(|s, _, w, cx| s.open(Mode::New, None, w, cx)))),
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
        if let Some(f) = self.form(cx) {
            page = page.child(f);
        }
        if let Mode::History(id) = self.mode.clone() {
            page = page.child(self.history(&id, &cur, cx));
        }
        if t.top_goals.is_empty() {
            page = page.child("No goals yet. Create one to track contributions and progress.");
        }
        for g in t.top_goals {
            let pct = if g.progress_pct.is_finite() { g.progress_pct.clamp(0.0, 100.0) } else { 0.0 };
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
            page = page.child(
                card(cx)
                    .child(h_flex().justify_between().child(bold(g.name.clone())).child(format!(
                        "{pct:.1}% · {} of {}",
                        format_money(g.invested_total, &cur),
                        format_money(g.target_amount, &cur)
                    )))
                    .child(Progress::new(SharedString::from(format!("p-{}", g.id))).value(pct as f32))
                    .child(format!("Remaining {}", format_money(g.remaining_amount, &cur)))
                    .child(row),
            );
        }
        page
    }
}
