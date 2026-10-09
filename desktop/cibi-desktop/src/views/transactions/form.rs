//! Create/edit sheet content. State lives here; `Page::submit` reads it.
use super::Page;
use cibi_client::{format::to_date_input_value, models::TransactionResponse};
use gpui_kit::component::{button::*, input::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

pub const KINDS: [&str; 4] = ["One-time", "Recurring", "Pending payment", "Installment plan"];
pub const FREQS: [&str; 3] = ["weekly", "bi-weekly", "monthly"];

pub struct Form {
    page: WeakEntity<Page>,
    pub editing: Option<String>,
    pub kind: usize,
    pub freq: usize,
    pub error: Option<String>,
    pub desc: Entity<InputState>,
    pub amount: Entity<InputState>,
    pub anchor: Entity<InputState>,
    pub total: Entity<InputState>,
}

impl Form {
    pub fn new(page: WeakEntity<Page>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut input = |ph: &'static str| cx.new(|cx| InputState::new(window, cx).placeholder(ph));
        Self {
            page,
            editing: None,
            kind: 0,
            freq: 2,
            error: None,
            desc: input("Description"),
            amount: input("-50.00 (negative = expense)"),
            anchor: input("YYYY-MM-DD"),
            total: input("12"),
        }
    }

    /// Reset to a blank form, or fill from `t` when editing.
    pub fn load(&mut self, t: Option<&TransactionResponse>, window: &mut Window, cx: &mut Context<Self>) {
        self.error = None;
        self.editing = t.map(|t| t.id.clone());
        self.kind = t.map_or(0, |t| match (t.is_installment, t.is_recurring, t.requires_confirmation) {
            (true, ..) => 3,
            (_, true, _) => 1,
            (_, _, true) => 2,
            _ => 0,
        });
        self.freq = t.and_then(|t| FREQS.iter().position(|f| Some(*f) == t.frequency.as_deref())).unwrap_or(2);
        let set = |i: &Entity<InputState>, v: String, window: &mut Window, cx: &mut App| i.update(cx, |i, cx| i.set_value(v, window, cx));
        set(&self.desc, t.map(|t| t.description.clone()).unwrap_or_default(), window, cx);
        set(&self.amount, t.map(|t| t.amount.to_string()).unwrap_or_default(), window, cx);
        set(&self.anchor, to_date_input_value(t.and_then(|t| t.anchor_date.as_deref())), window, cx);
        set(&self.total, t.and_then(|t| t.total_installments).map(|n| n.to_string()).unwrap_or_default(), window, cx);
        cx.notify();
    }
}

impl Render for Form {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let field = |label: &'static str, i: &Entity<InputState>| v_flex().gap_1().child(div().text_xs().child(label)).child(Input::new(i));
        let kinds = h_flex().flex_wrap().gap_2().children(KINDS.iter().enumerate().map(|(i, k)| {
            Button::new(("kind", i)).label(*k).when(self.kind == i, |b| b.primary()).on_click(cx.listener(move |f, _, _, cx| {
                f.kind = i;
                cx.notify();
            }))
        }));
        let freqs = h_flex().gap_2().children(FREQS.iter().enumerate().map(|(i, k)| {
            Button::new(("freq", i)).label(*k).when(self.freq == i, |b| b.primary()).on_click(cx.listener(move |f, _, _, cx| {
                f.freq = i;
                cx.notify();
            }))
        }));
        let page = self.page.clone();
        let save = Button::new("save").primary().label(if self.editing.is_some() { "Update" } else { "Create" }).on_click(move |_, w, cx| {
            page.update(cx, |p, cx| p.submit(w, cx)).ok();
        });
        v_flex()
            .gap_3()
            .child(field(if self.kind == 3 { "Per installment amount" } else { "Amount" }, &self.amount))
            .child(field("Description", &self.desc))
            .child(v_flex().gap_1().child(div().text_xs().child("Type")).child(kinds))
            .when(self.kind == 3, |d| d.child(field("Total installments", &self.total)))
            .when(self.kind == 1 || self.kind == 3, |d| d.child(v_flex().gap_1().child(div().text_xs().child("Frequency")).child(freqs)))
            .when(self.kind != 0, |d| d.child(field(if self.kind == 2 { "Pending date" } else { "Anchor / first payment date" }, &self.anchor)))
            .when_some(self.error.clone(), |d, e| d.child(div().text_sm().text_color(cx.theme().danger).child(e)))
            .child(h_flex().gap_2().child(save).child(Button::new("cancel").label("Cancel").on_click(|_, w, cx| w.close_sheet(cx))))
    }
}
