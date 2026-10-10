//! Settings: profile overview, appearance, connection, background toggles, record income and ledger (web/src/pages/settings.tsx + ledger API).
pub mod form;

use crate::state::AppState;
use crate::views::ui::{amount_color, card, money, open_form_sheet, row};
use cibi_client::format::{format_date, format_time_utc};
use cibi_client::models::RecordIncomeRequest;
use form::{Form, Kind};
use gpui_kit::component::{accordion::*, button::*, input::*, switch::Switch, *};
use gpui_kit::*;

pub struct Settings {
    state: Entity<AppState>,
    form: Entity<Form>,
    amount: Entity<InputState>,
    desc: Entity<InputState>,
    loaded_for: Option<String>,
}

impl Settings {
    pub fn new(state: Entity<AppState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let form = cx.new(|cx| Form::new(state.clone(), window, cx));
        let mut input = |ph: &'static str| cx.new(|cx| InputState::new(window, cx).placeholder(ph));
        let (amount, desc) = (input("Amount (whole units)"), input("Description"));
        cx.observe(&state, |t, _, cx| t.sync(cx)).detach();
        Self { state, form, amount, desc, loaded_for: None }
    }

    /// Reload when the selected account changes.
    fn sync(&mut self, cx: &mut Context<Self>) {
        let sel = self.state.read(cx).selected.clone();
        if sel != self.loaded_for {
            self.loaded_for = sel;
            self.state.update(cx, |s, cx| s.load_settings(cx));
        }
    }

    fn open_form(&self, kind: Kind, window: &mut Window, cx: &mut Context<Self>) {
        let form = self.form.clone();
        form.update(cx, |f, cx| f.load(kind, window, cx));
        let title = if kind == Kind::Profile { "Edit profile" } else { "Connection" };
        open_form_sheet(window, cx, title, form);
    }

    /// Run a mutation, then reload the page data.
    fn act(&self, cx: &mut Context<Self>, call: impl FnOnce(cibi_client::Client) -> Result<(), cibi_client::Error> + Send + 'static) {
        self.state.update(cx, |s, cx| s.fetch(cx, call, |s, _, cx| s.load_settings(cx)));
    }

    fn record_income(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let s = self.state.read(cx);
        let (Some(account_id), Some(pay_schedule_id)) = (s.selected.clone(), s.pay_schedule_id.clone()) else { return };
        let (Ok(amount), description) = (self.amount.read(cx).value().trim().parse::<i64>(), self.desc.read(cx).value().trim().to_string()) else {
            self.state.update(cx, |s, _| s.error = Some("Amount must be a whole number".into()));
            return;
        };
        for i in [&self.amount, &self.desc] {
            i.update(cx, |i, cx| i.set_value("", window, cx));
        }
        let d = RecordIncomeRequest { account_id, pay_schedule_id, amount, description };
        self.act(cx, move |c| c.record_income(&d));
    }
}

impl Render for Settings {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let this = cx.entity();
        let s_ent = self.state.clone();
        let s = self.state.read(cx);
        let acct = s.accounts.iter().find(|a| s.selected.as_deref() == Some(a.id.as_str())).cloned();
        let p = s.profile.clone().unwrap_or_default();
        let cur = acct.as_ref().map_or_else(|| "BRL".to_string(), |a| a.currency.clone());
        let account = acct.as_ref().map_or_else(|| "None".to_string(), |a| format!("{} · {}", a.name, a.currency));
        let is_default = if acct.as_ref().is_some_and(|a| a.is_default) { "Yes" } else { "No" };
        let public = if s.public_base_url.is_empty() { "Not configured on the server".to_string() } else { s.public_base_url.clone() };
        let can_income = s.pay_schedule_id.is_some();
        let app: &App = cx;
        let ledger = v_flex().gap_1().children(s.ledger.iter().map(|e| {
            let (t, id) = (this.clone(), e.id.clone());
            h_flex()
                .gap_3()
                .child(div().w_56().text_sm().text_color(app.theme().muted_foreground).child(format!("{} {}", format_date(&e.posted_at), format_time_utc(&e.posted_at))))
                .child(div().w_40().text_sm().child(e.entry_type.replace('_', " ")))
                .child(div().w_32().text_sm().text_color(amount_color(app, e.amount)).child(money(e.amount, &cur)))
                .child(div().flex_1().text_sm().child(e.description.clone()))
                .child(Button::new(format!("del-{id}")).danger().outline().label("Delete").on_click(move |_, _, cx| {
                    let id = id.clone();
                    t.update(cx, |t, cx| t.act(cx, move |c| c.delete_ledger_entry(&id)));
                }))
        }));
        let (t_profile, t_conn, t_inc) = (this.clone(), this.clone(), this.clone());
        let profile = card(app, "Profile")
            .child(row(app, "Display name", p.display_name))
            .child(row(app, "PIX key", p.pix_key.unwrap_or_else(|| "Not set".into())))
            .child(row(app, "Account", account))
            .child(row(app, "Default account", is_default))
            .child(h_flex().child(Button::new("edit-profile").label("Edit profile").on_click(move |_, window, cx| {
                t_profile.update(cx, |t, cx| t.open_form(Kind::Profile, window, cx))
            })));
        let appearance = card(app, "Appearance").child(Switch::new("dark").label("Dark mode").checked(s.config.dark).on_click({
            let st = s_ent.clone();
            move |v: &bool, _, cx| st.update(cx, |s, cx| s.set_dark(*v, cx))
        }));
        let connection = card(app, "Connection")
            .child(row(app, "API base URL", s.config.base_url.clone()))
            .child(row(app, "Public base URL", public))
            .child(h_flex().child(Button::new("edit-connection").label("Edit").on_click(move |_, window, cx| {
                t_conn.update(cx, |t, cx| t.open_form(Kind::Connection, window, cx))
            })));
        let background = card(app, "Background")
            .child(Switch::new("tray").label("Close button hides to tray").checked(s.config.close_to_tray).on_click({
                let st = s_ent.clone();
                move |v: &bool, _, cx| st.update(cx, |s, cx| s.set_toggle(false, *v, cx))
            }))
            .child(Switch::new("login").label("Start at login").checked(s.config.start_at_login).on_click({
                let st = s_ent.clone();
                move |v: &bool, _, cx| st.update(cx, |s, cx| s.set_toggle(true, *v, cx))
            }));
        let sections = Accordion::new("settings-sections")
            .item(|i| {
                i.title("Record income").child(
                    h_flex()
                        .gap_2()
                        .child(div().w_48().child(Input::new(&self.amount)))
                        .child(div().w_96().child(Input::new(&self.desc)))
                        .child(Button::new("income").primary().label(if can_income { "Record" } else { "No pay schedule" }).disabled(!can_income).on_click(
                            move |_, window, cx| t_inc.update(cx, |t, cx| t.record_income(window, cx)),
                        )),
                )
            })
            .item(|i| i.title("Ledger").child(ledger));
        v_flex()
            .size_full()
            .p_6()
            .gap_3()
            .id("settings")
            .overflow_y_scroll()
            .child(div().text_xl().child("Settings"))
            .child(profile)
            .child(appearance)
            .child(connection)
            .child(background)
            .child(sections)
    }
}
