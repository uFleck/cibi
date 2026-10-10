//! Settings: profile + theme, API base URL, record income, ledger (web/src/pages/settings.tsx + ledger API).
use crate::state::AppState;
use cibi_client::format::{format_date, format_time_utc};
use cibi_client::models::{RecordIncomeRequest, UpdateProfileRequest};
use gpui_kit::component::{button::*, input::*, switch::Switch, *};
use gpui_kit::*;

pub struct Settings {
    state: Entity<AppState>,
    name: Entity<InputState>,
    pix: Entity<InputState>,
    url: Entity<InputState>,
    amount: Entity<InputState>,
    desc: Entity<InputState>,
    loaded_for: Option<String>,
    seen_rev: usize,
}

impl Settings {
    pub fn new(state: Entity<AppState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = |ph: &str, window: &mut Window, cx: &mut Context<Self>| {
            let ph = ph.to_string();
            cx.new(|cx| InputState::new(window, cx).placeholder(ph))
        };
        let url = input("http://localhost:42069", window, cx);
        let base = state.read(cx).config.base_url.clone();
        url.update(cx, |u, cx| u.set_value(base, window, cx));
        cx.observe_in(&state, window, |t, _, window, cx| t.sync(window, cx)).detach();
        Self {
            name: input("Display name", window, cx),
            pix: input("PIX key (optional)", window, cx),
            amount: input("Amount (whole units)", window, cx),
            desc: input("Description", window, cx),
            url,
            state,
            loaded_for: None,
            seen_rev: 0,
        }
    }

    /// Reload on account switch; copy a freshly loaded profile into the inputs.
    fn sync(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (sel, rev, profile) = {
        let s = self.state.read(cx);
            (s.selected.clone(), s.profile_rev, s.profile.clone())
        };
        if sel != self.loaded_for {
            self.loaded_for = sel;
            self.seen_rev = rev;
            for i in [&self.name, &self.pix] {
                i.update(cx, |i, cx| i.set_value("", window, cx));
            }
            self.state.update(cx, |s, cx| s.load_settings(cx));
        } else if rev != self.seen_rev {
            self.seen_rev = rev;
            let p = profile.unwrap_or_default();
            self.name.update(cx, |i, cx| i.set_value(p.display_name, window, cx));
            self.pix.update(cx, |i, cx| i.set_value(p.pix_key.unwrap_or_default(), window, cx));
        }
    }

    /// Run a mutation, then reload the page data.
    fn act(&self, cx: &mut Context<Self>, call: impl FnOnce(cibi_client::Client) -> Result<(), cibi_client::Error> + Send + 'static) {
        self.state.update(cx, |s, cx| s.fetch(cx, call, |s, _, cx| s.load_settings(cx)));
    }

    fn save_profile(&mut self, cx: &mut Context<Self>) {
        let Some(id) = self.state.read(cx).selected.clone() else { return };
        let name = self.name.read(cx).value().trim().to_string();
        let pix = self.pix.read(cx).value().trim().to_string();
        if name.is_empty() {
            self.state.update(cx, |s, _| s.error = Some("Display name is required".into()));
            return;
        }
        // The API theme field is ignored on desktop (fixed palette); send it back unchanged.
        let theme = self.state.read(cx).profile.as_ref().map(|p| p.theme.clone());
        let d = UpdateProfileRequest {
            display_name: name,
            theme: theme.filter(|t| !t.is_empty()).unwrap_or_else(|| "green-anchor".into()),
            pix_key: Some(pix).filter(|p| !p.is_empty()),
        };
        // select() re-reads the profile and re-applies the accent colour.
        self.state.update(cx, |s, cx| {
            s.fetch(cx, move |c| c.update_profile(&id, &d).map(|_| id), |s, id, cx| {
                s.select(Some(id), cx);
                s.load_settings(cx);
            })
        });
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
        let can_income = s.pay_schedule_id.is_some();
        let section = |title: &str| div().text_lg().mt_4().child(title.to_string());
        let t = this.clone();
        let ledger = v_flex().gap_1().children(s.ledger.iter().map(|e| {
            let (t, id) = (this.clone(), e.id.clone());
            h_flex()
                .gap_3()
                .child(div().w_56().child(format!("{} {}", format_date(&e.posted_at), format_time_utc(&e.posted_at))))
                .child(div().w_40().child(e.entry_type.replace('_', " ")))
                .child(div().w_32().child(format!("R$ {:.2}", e.amount)))
                .child(div().flex_1().child(e.description.clone()))
                .child(Button::new(format!("del-{id}")).danger().outline().label("Delete").on_click(move |_, _, cx| {
                    let id = id.clone();
                    t.update(cx, |t, cx| t.act(cx, move |c| c.delete_ledger_entry(&id)));
                }))
        }));
        let (t_url, t_inc) = (this.clone(), this.clone());
        v_flex()
            .size_full()
            .p_6()
            .gap_2()
            .id("settings").overflow_y_scroll()
            .child(div().text_xl().child("Settings"))
            .child(section("Profile"))
            .child(div().w_96().child(Input::new(&self.name)))
            .child(div().w_96().child(Input::new(&self.pix)))
            .child(h_flex().child(Button::new("save-profile").primary().label("Save profile").on_click(move |_, _, cx| t.update(cx, |t, cx| t.save_profile(cx)))))
            .child(section("API base URL"))
            .child(
                h_flex().gap_2().child(div().w_96().child(Input::new(&self.url))).child(Button::new("save-url").label("Save").on_click(move |_, _, cx| {
                    t_url.update(cx, |t, cx| {
                        let u = t.url.read(cx).value().to_string();
                        t.state.update(cx, |s, cx| s.set_base_url(&u, cx));
                    })
                })),
            )
            .child(section("Background"))
            .child(Switch::new("tray").label("Close button hides to tray").checked(s.config.close_to_tray).on_click({
                let st = s_ent.clone();
                move |v: &bool, _, cx| st.update(cx, |s, cx| s.set_toggle(false, *v, cx))
            }))
            .child(Switch::new("login").label("Start at login").checked(s.config.start_at_login).on_click({
                let st = s_ent.clone();
                move |v: &bool, _, cx| st.update(cx, |s, cx| s.set_toggle(true, *v, cx))
            }))
            .child(section("Public base URL"))
            .child(div().child(if s.public_base_url.is_empty() { "Not configured on the server".to_string() } else { s.public_base_url.clone() }))
            .child(section("Record income"))
            .child(
                h_flex()
                    .gap_2()
                    .child(div().w_48().child(Input::new(&self.amount)))
                    .child(div().w_96().child(Input::new(&self.desc)))
                    .child(Button::new("income").primary().label(if can_income { "Record" } else { "No pay schedule" }).disabled(!can_income).on_click(
                        move |_, window, cx| t_inc.update(cx, |t, cx| t.record_income(window, cx)),
                    )),
            )
            .child(section("Ledger"))
            .child(ledger)
    }
}
