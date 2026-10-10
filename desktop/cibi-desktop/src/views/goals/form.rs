//! Goal sheet content: new/edit, add/remove money and the ledger. State lives here; `Page` (goals.rs) validates and saves.
use super::{bold, card, Page};
use cibi_client::{format::*, models::*};
use gpui_kit::component::{button::*, input::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;
use std::collections::HashSet;

#[derive(Clone, PartialEq)]
pub enum Mode {
    None,
    New,
    Edit(String),
    Add(String),
    Remove(String),
    History(String),
}

pub struct GoalForm {
    page: WeakEntity<Page>,
    pub mode: Mode,
    pub cur: String,
    pub error: Option<String>,
    pub ledger: Vec<GoalLedgerEntryResponse>,
    pub name: Entity<InputState>,
    pub target: Entity<InputState>,
    pub min: Entity<InputState>,
    pub amount: Entity<InputState>,
    pub note: Entity<InputState>,
}

fn input(ph: &'static str, w: &mut Window, cx: &mut App) -> Entity<InputState> {
    cx.new(|cx| InputState::new(w, cx).placeholder(ph))
}

impl GoalForm {
    pub fn new(page: WeakEntity<Page>, w: &mut Window, cx: &mut Context<Self>) -> Self {
        Self {
            page,
            mode: Mode::None,
            cur: String::new(),
            error: None,
            ledger: vec![],
            name: input("Trip, emergency fund...", w, cx),
            target: input("Target amount, e.g. 1500.00", w, cx),
            min: input("Min contribution per window (empty = none)", w, cx),
            amount: input("Amount, e.g. 50.00", w, cx),
            note: input("Reason", w, cx),
        }
    }

    pub fn load(&mut self, mode: Mode, g: Option<&GoalsTrackingGoalResponse>, cur: &str, w: &mut Window, cx: &mut Context<Self>) {
        self.error = None;
        self.cur = cur.to_string();
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
        cx.notify();
    }

    pub fn fail(&mut self, msg: &str, cx: &mut Context<Self>) {
        self.error = Some(msg.to_string());
        cx.notify();
    }

    fn history(&self, goal_id: &str, cx: &App) -> Div {
        let reversed: HashSet<&str> = self.ledger.iter().filter_map(|e| e.reverses_entry_id.as_deref()).collect();
        let rows = self.ledger.iter().map(|e| {
            let (page, gid, eid) = (self.page.clone(), goal_id.to_string(), e.id.clone());
            let is_reversed = reversed.contains(e.id.as_str());
            h_flex()
                .gap_3()
                .child(format!("{} · {} · {}", format_date(&e.timestamp_utc), e.r#type, e.source))
                .child(format_money(e.amount, &self.cur))
                .when(is_reversed, |d| d.child("reversed"))
                .when(e.reverses_entry_id.is_none() && !is_reversed, |d| {
                    d.child(Button::new(SharedString::from(format!("rev-{}", e.id))).small().outline().label("Reverse").on_click(move |_, _, cx| {
                        let (g, e) = (gid.clone(), eid.clone());
                        page.update(cx, |p, cx| p.mutate(cx, move |c| c.reverse_goal_ledger_entry(&g, &e).map(|_| ()))).ok();
                    }))
                })
        });
        card(cx).child(bold("Ledger")).children(rows).when(self.ledger.is_empty(), |d| d.child("No entries."))
    }
}

impl Render for GoalForm {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let fields = match &self.mode {
            Mode::New | Mode::Edit(_) => vec![("Name", &self.name), ("Target", &self.target), ("Min contribution / window", &self.min)],
            Mode::Add(_) => vec![("Amount", &self.amount)],
            Mode::Remove(_) => vec![("Amount", &self.amount), ("Reason", &self.note)],
            Mode::History(_) | Mode::None => vec![],
        };
        let history = match &self.mode {
            Mode::History(id) => Some(self.history(id, cx)),
            _ => None,
        };
        let page = self.page.clone();
        let danger = cx.theme().danger;
        let save = Button::new("submit").primary().label("Save").on_click(move |_, w, cx| {
            page.update(cx, |p, cx| p.submit(w, cx)).ok();
        });
        let error = self.error.clone();
        v_flex()
            .gap_3()
            .when(!fields.is_empty(), |d| {
                d.child(v_flex().gap_2().children(fields.into_iter().map(|(l, i)| v_flex().gap_1().child(l).child(Input::new(i)))))
                    .when_some(error, |d, e| d.child(div().text_sm().text_color(danger).child(e)))
                    .child(h_flex().gap_2().child(save).child(Button::new("cancel").label("Cancel").on_click(|_, w, cx| w.close_sheet(cx))))
            })
            .when_some(history, |d, h| d.child(h))
    }
}
