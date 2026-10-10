//! Sheet content for the friends-page forms (friend, debt, group event, event transaction).
//! State lives here; `save` validates, builds the API call and hands it to the page (`View::mutate`).
use super::View;
use cibi_client::{format::*, models::*, Client, Error};
use gpui_kit::component::{button::*, input::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

pub(super) type Job = Box<dyn FnOnce(Client) -> Result<(), Error> + Send>;

#[derive(Clone)]
pub(super) enum Kind {
    Friend(Option<FriendResponse>),
    Debt(String),
    Event,
    Tx(String),
}

pub(super) struct Form {
    page: WeakEntity<View>,
    kind: Kind,
    account: String,
    error: Option<String>,
    name: Entity<InputState>,
    pix: Entity<InputState>,
    notes: Entity<InputState>,
    amount: Entity<InputState>,
    desc: Entity<InputState>,
    title: Entity<InputState>,
    total: Entity<InputState>,
}

fn boxed(f: impl FnOnce(Client) -> Result<(), Error> + Send + 'static) -> Job {
    Box::new(f)
}

fn today() -> String {
    // The Go API wants RFC3339; midnight UTC like the web date inputs.
    from_date_input_value(Some(&chrono::Utc::now().format("%Y-%m-%d").to_string())).unwrap()
}

impl Form {
    pub(super) fn new(page: WeakEntity<View>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut input = |ph: &'static str| cx.new(|cx| InputState::new(window, cx).placeholder(ph));
        Self {
            page,
            kind: Kind::Event,
            account: String::new(),
            error: None,
            name: input("Name"),
            pix: input("PIX key (optional)"),
            notes: input("Notes"),
            amount: input("Amount"),
            desc: input("Description"),
            title: input("Event title"),
            total: input("Total amount"),
        }
    }

    /// Reset the fields for `kind`, pre-filled when editing a friend.
    pub(super) fn load(&mut self, kind: Kind, account: String, window: &mut Window, cx: &mut Context<Self>) {
        self.error = None;
        let (name, pix, notes) = match &kind {
            Kind::Friend(Some(f)) => (f.name.clone(), f.pix_key.clone().unwrap_or_default(), f.notes.clone().unwrap_or_default()),
            _ => Default::default(),
        };
        let set = |i: &Entity<InputState>, v: String, window: &mut Window, cx: &mut App| i.update(cx, |i, cx| i.set_value(v, window, cx));
        set(&self.name, name, window, cx);
        set(&self.pix, pix, window, cx);
        set(&self.notes, notes, window, cx);
        for i in [&self.amount, &self.desc, &self.title, &self.total] {
            set(i, String::new(), window, cx);
        }
        self.kind = kind;
        self.account = account;
        cx.notify();
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let v = |i: &Entity<InputState>| i.read(cx).value().trim().to_string();
        let (name, pix, notes) = (v(&self.name), v(&self.pix), v(&self.notes));
        let (desc, amount, title, total) = (v(&self.desc), v(&self.amount), v(&self.title), v(&self.total));
        let acct = self.account.clone();
        let job: Result<Job, &str> = match self.kind.clone() {
            Kind::Friend(_) if name.is_empty() => Err("Name required"),
            // PATCH treats "" as clearing the field.
            Kind::Friend(Some(f)) => Ok(boxed(move |c| {
                c.update_friend(&f.id, &PatchFriendRequest { name: Some(name), notes: Some(notes), pix_key: Some(pix) }).map(|_| ())
            })),
            Kind::Friend(None) => Ok(boxed(move |c| {
                c.create_friend(&CreateFriendRequest {
                    name,
                    notes: Some(notes).filter(|s| !s.is_empty()),
                    pix_key: Some(pix).filter(|s| !s.is_empty()),
                })
                .map(|_| ())
            })),
            Kind::Debt(friend_id) => match parse_decimal_input(&amount) {
                None => Err("Enter a valid amount"),
                Some(_) if desc.is_empty() => Err("Description required"),
                Some(amount) => Ok(boxed(move |c| {
                    let d = CreatePeerDebtRequest { account_id: acct, friend_id, amount, description: desc, date: today(), ..Default::default() };
                    c.create_peer_debt(&d).map(|_| ())
                })),
            },
            Kind::Event => match parse_decimal_input(&total).filter(|t| *t > 0.0) {
                None => Err("Please enter a valid total amount"),
                Some(_) if title.is_empty() => Err("Title required"),
                Some(total_amount) => Ok(boxed(move |c| {
                    let d = CreateGroupEventRequest { account_id: acct, title, date: today(), total_amount, notes: None };
                    c.create_group_event(&d).map(|_| ())
                })),
            },
            // The API takes int64 whole units here.
            Kind::Tx(event_id) => match amount.parse::<i64>().ok().filter(|a| *a > 0) {
                None => Err("Amount must be a positive whole number"),
                Some(_) if desc.is_empty() => Err("Description required"),
                Some(amount) => Ok(boxed(move |c| {
                    c.add_group_event_transaction(&event_id, &AddTransactionRequest { description: desc, amount }).map(|_| ())
                })),
            },
        };
        match job {
            Ok(job) => {
                self.page.update(cx, |p, cx| p.mutate(cx, job)).ok();
                window.close_sheet(cx);
            }
            Err(e) => self.error = Some(e.into()),
        }
    }
}

impl Render for Form {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let field = |label: &'static str, i: &Entity<InputState>| v_flex().gap_1().child(div().text_xs().child(label)).child(Input::new(i));
        let friend = matches!(self.kind, Kind::Friend(_));
        let event = matches!(self.kind, Kind::Event);
        v_flex()
            .gap_3()
            .when(friend, |d| d.child(field("Name", &self.name)).child(field("PIX key", &self.pix)).child(field("Notes", &self.notes)))
            .when(event, |d| d.child(field("Title", &self.title)).child(field("Total amount", &self.total)))
            .when(!friend && !event, |d| d.child(field("Amount", &self.amount)).child(field("Description", &self.desc)))
            .when_some(self.error.clone(), |d, e| d.child(div().text_sm().text_color(cx.theme().danger).child(e)))
            .child(
                h_flex()
                    .gap_2()
                    .child(Button::new("save").primary().label("Save").on_click(cx.listener(|f, _, w, cx| f.save(w, cx))))
                    .child(Button::new("cancel").label("Cancel").on_click(|_, w, cx| w.close_sheet(cx))),
            )
    }
}
