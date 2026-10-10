//! Account and pay-schedule sheet content. State lives here; `Page` (accounts.rs) validates and saves.
use super::Page;
use cibi_client::{
    format::{format_money, parse_decimal_input, to_date_input_value},
    models::*,
};
use gpui_kit::component::{button::*, input::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

pub const CURRENCIES: [&str; 12] = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "MXN", "BRL", "INR", "SGD", "HKD"];
pub const FREQS: [&str; 4] = ["weekly", "bi-weekly", "semi-monthly", "monthly"];

pub fn input(ph: &'static str, w: &mut Window, cx: &mut App) -> Entity<InputState> {
    cx.new(|cx| InputState::new(w, cx).placeholder(ph))
}

pub fn set(i: &Entity<InputState>, v: String, w: &mut Window, cx: &mut App) {
    i.update(cx, |i, cx| i.set_value(v, w, cx));
}

pub fn text(i: &Entity<InputState>, cx: &App) -> String {
    i.read(cx).value().trim().to_string()
}

pub fn num(i: &Entity<InputState>, cx: &App) -> Option<f64> {
    match text(i, cx).as_str() {
        "" => Some(0.0),
        t => parse_decimal_input(t),
    }
}

pub fn field(label: &str, i: &Entity<InputState>) -> impl IntoElement {
    v_flex().gap_1().child(div().text_xs().child(label.to_string())).child(Input::new(i))
}

pub fn choice<T: 'static>(id: &str, items: &[&str], sel: usize, on: impl Fn(&mut T, usize, &mut Context<T>) + Clone + 'static, cx: &mut Context<T>) -> impl IntoElement {
    h_flex().gap_1().flex_wrap().children(items.iter().enumerate().map(|(n, c)| {
        let on = on.clone();
        let b = Button::new(SharedString::from(format!("{id}{c}"))).compact().label(c.to_string());
        let b = if n == sel { b.primary() } else { b.outline() };
        b.on_click(cx.listener(move |p, _, _, cx| on(p, n, cx)))
    }))
}

pub struct AccountForm {
    page: WeakEntity<Page>,
    pub editing: Option<String>,
    pub currency: usize,
    pub error: Option<String>,
    pub name: Entity<InputState>,
    pub balance: Entity<InputState>,
    pub buffer: Entity<InputState>,
}

impl AccountForm {
    pub fn new(page: WeakEntity<Page>, w: &mut Window, cx: &mut Context<Self>) -> Self {
        Self {
            page,
            editing: None,
            currency: CURRENCIES.iter().position(|c| *c == "BRL").unwrap(),
            error: None,
            name: input("Account name", w, cx),
            balance: input("0.00", w, cx),
            buffer: input("0.00", w, cx),
        }
    }

    /// Reset to a blank form, or fill from `acc` when editing.
    pub fn load(&mut self, acc: Option<&AccountResponse>, w: &mut Window, cx: &mut Context<Self>) {
        self.error = None;
        self.editing = acc.map(|a| a.id.clone());
        set(&self.name, acc.map_or(String::new(), |a| a.name.clone()), w, cx);
        set(&self.balance, acc.map_or("0".to_string(), |a| a.current_balance.to_string()), w, cx);
        set(&self.buffer, acc.map_or("0".to_string(), |a| a.safety_buffer.to_string()), w, cx);
        self.currency = CURRENCIES.iter().position(|c| Some(*c) == acc.map(|a| a.currency.as_str())).unwrap_or(8);
        cx.notify();
    }

    pub fn fail(&mut self, msg: &str, cx: &mut Context<Self>) {
        self.error = Some(msg.to_string());
        cx.notify();
    }
}

impl Render for AccountForm {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let page = self.page.clone();
        let danger = cx.theme().danger;
        let currency = choice("cur", &CURRENCIES, self.currency, |f: &mut Self, n, cx| {
            f.currency = n;
            cx.notify()
        }, cx);
        v_flex()
            .gap_3()
            .child(field("Name", &self.name))
            .child(field("Balance", &self.balance))
            .child(field("Safety buffer", &self.buffer))
            .child(currency)
            .when_some(self.error.clone(), |d, e| d.child(div().text_sm().text_color(danger).child(e)))
            .child(
                h_flex()
                    .gap_2()
                    .child(Button::new("save").primary().label("Save").on_click(move |_, w, cx| {
                        page.update(cx, |p, cx| p.submit_account(w, cx)).ok();
                    }))
                    .child(Button::new("cancel").label("Cancel").on_click(|_, w, cx| w.close_sheet(cx))),
            )
    }
}

/// Pay schedules of one account: list with confirm/edit/delete, and the create/edit form in the same sheet.
pub struct SchedulesForm {
    page: WeakEntity<Page>,
    pub account: Option<String>,
    pub currency: String,
    pub schedules: Vec<PayScheduleResponse>,
    /// None = list, Some(None) = creating, Some(Some(id)) = editing.
    pub form: Option<Option<String>>,
    pub freq: usize,
    pub error: Option<String>,
    pub label: Entity<InputState>,
    pub anchor: Entity<InputState>,
    pub amount: Entity<InputState>,
    pub day2: Entity<InputState>,
}

impl SchedulesForm {
    pub fn new(page: WeakEntity<Page>, w: &mut Window, cx: &mut Context<Self>) -> Self {
        Self {
            page,
            account: None,
            currency: "BRL".to_string(),
            schedules: vec![],
            form: None,
            freq: 3,
            error: None,
            label: input("Label (optional)", w, cx),
            anchor: input("YYYY-MM-DD", w, cx),
            amount: input("0.00", w, cx),
            day2: input("Second day of month", w, cx),
        }
    }

    pub fn open(&mut self, acc: &AccountResponse, cx: &mut Context<Self>) {
        self.account = Some(acc.id.clone());
        self.currency = acc.currency.clone();
        self.schedules.clear();
        self.form = None;
        self.error = None;
        cx.notify();
    }

    /// Show the form for `ps` (None = new) inside this sheet.
    pub fn open_sform(&mut self, ps: Option<&PayScheduleResponse>, w: &mut Window, cx: &mut Context<Self>) {
        self.form = Some(ps.map(|p| p.id.clone()));
        self.error = None;
        set(&self.label, ps.and_then(|p| p.label.clone()).unwrap_or_default(), w, cx);
        set(&self.anchor, to_date_input_value(ps.map(|p| p.anchor_date.as_str())), w, cx);
        set(&self.amount, ps.map_or(String::new(), |p| p.amount.to_string()), w, cx);
        set(&self.day2, ps.and_then(|p| p.day_of_month_2).map_or(String::new(), |d| d.to_string()), w, cx);
        self.freq = ps.and_then(|p| FREQS.iter().position(|f| *f == p.frequency)).unwrap_or(3);
        cx.notify();
    }

    pub fn fail(&mut self, msg: &str, cx: &mut Context<Self>) {
        self.error = Some(msg.to_string());
        cx.notify();
    }

    fn list(&self, cx: &mut Context<Self>) -> Div {
        let page = self.page.clone();
        let cur = self.currency.clone();
        v_flex()
            .gap_2()
            .children(self.schedules.iter().map(|s| {
                let (edit, cid, did) = (s.clone(), s.id.clone(), s.id.clone());
                let (page_c, page_d) = (page.clone(), page.clone());
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
                    .child(Button::new(SharedString::from(format!("cf{}", s.id))).compact().outline().label("Confirm").on_click(move |_, _, cx| {
                        let id = cid.clone();
                        page_c.update(cx, |p, cx| p.run(cx, true, move |c| c.confirm_pay_schedule(&id).map(|_| ()), |_, _, _| {})).ok();
                    }))
                    .child(Button::new(SharedString::from(format!("se{}", s.id))).compact().outline().label("Edit").on_click(cx.listener(move |f, _, w, cx| f.open_sform(Some(&edit), w, cx))))
                    .child(Button::new(SharedString::from(format!("sd{}", s.id))).compact().outline().label("Delete").on_click(move |_, _, cx| {
                        let id = did.clone();
                        page_d.update(cx, |p, cx| p.run(cx, true, move |c| c.delete_pay_schedule(&id), |_, _, _| {})).ok();
                    }))
            }))
            .child(Button::new("sadd").compact().label("Add schedule").on_click(cx.listener(|f, _, w, cx| f.open_sform(None, w, cx))))
    }

    fn editor(&self, cx: &mut Context<Self>) -> Div {
        let page = self.page.clone();
        let title = if matches!(self.form, Some(Some(_))) { "Edit pay schedule" } else { "New pay schedule" };
        let danger = cx.theme().danger;
        let freq = choice("fq", &FREQS, self.freq, |f: &mut Self, n, cx| {
            f.freq = n;
            cx.notify()
        }, cx);
        v_flex()
            .gap_3()
            .child(div().font_weight(FontWeight::SEMIBOLD).child(title))
            .child(freq)
            .child(field("Label", &self.label))
            .child(field("Anchor date (YYYY-MM-DD)", &self.anchor))
            .child(field("Amount", &self.amount))
            .when(FREQS[self.freq] == "semi-monthly", |d| d.child(field("Second day of month", &self.day2)))
            .when_some(self.error.clone(), |d, e| d.child(div().text_sm().text_color(danger).child(e)))
            .child(
                h_flex()
                    .gap_2()
                    .child(Button::new("ssave").primary().label("Save").on_click(move |_, _, cx| {
                        page.update(cx, |p, cx| p.submit_sched(cx)).ok();
                    }))
                    .child(Button::new("scancel").label("Cancel").on_click(cx.listener(|f, _, _, cx| {
                        f.form = None;
                        cx.notify();
                    }))),
            )
    }
}

impl Render for SchedulesForm {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.form.is_some() {
            self.editor(cx).into_any_element()
        } else {
            self.list(cx).into_any_element()
        }
    }
}
