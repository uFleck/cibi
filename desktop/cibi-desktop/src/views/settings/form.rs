//! Settings sheet content: profile and API connection edit forms. `kind` picks the fields.
use crate::state::AppState;
use cibi_client::models::UpdateProfileRequest;
use gpui_kit::component::{button::*, input::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Profile,
    Connection,
}

pub struct Form {
    state: Entity<AppState>,
    kind: Kind,
    error: Option<String>,
    name: Entity<InputState>,
    pix: Entity<InputState>,
    url: Entity<InputState>,
}

impl Form {
    pub fn new(state: Entity<AppState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut input = |ph: &'static str| cx.new(|cx| InputState::new(window, cx).placeholder(ph));
        Self {
            kind: Kind::Profile,
            error: None,
            name: input("Display name"),
            pix: input("PIX key (optional)"),
            url: input("http://localhost:42069"),
            state,
        }
    }

    /// Fill the inputs from the current state before the sheet opens.
    pub fn load(&mut self, kind: Kind, window: &mut Window, cx: &mut Context<Self>) {
        self.kind = kind;
        self.error = None;
        let s = self.state.read(cx);
        let p = s.profile.clone().unwrap_or_default();
        let url = s.config.base_url.clone();
        let set = |i: &Entity<InputState>, v: String, window: &mut Window, cx: &mut App| i.update(cx, |i, cx| i.set_value(v, window, cx));
        set(&self.name, p.display_name, window, cx);
        set(&self.pix, p.pix_key.unwrap_or_default(), window, cx);
        set(&self.url, url, window, cx);
        cx.notify();
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        match self.kind {
            Kind::Profile => self.save_profile(window, cx),
            Kind::Connection => {
                let u = self.url.read(cx).value().to_string();
                self.state.update(cx, |s, cx| s.set_base_url(&u, cx));
                window.close_sheet(cx);
            }
        }
    }

    fn save_profile(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(id) = self.state.read(cx).selected.clone() else { return };
        let name = self.name.read(cx).value().trim().to_string();
        if name.is_empty() {
            self.error = Some("Display name is required".into());
            cx.notify();
            return;
        }
        let pix = self.pix.read(cx).value().trim().to_string();
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
        window.close_sheet(cx);
    }
}

impl Render for Form {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let this = cx.entity();
        let danger = cx.theme().danger;
        let field = |label: &'static str, i: &Entity<InputState>| v_flex().gap_1().child(div().text_xs().child(label)).child(Input::new(i));
        let inputs = match self.kind {
            Kind::Profile => v_flex().gap_3().child(field("Display name", &self.name)).child(field("PIX key", &self.pix)),
            Kind::Connection => v_flex().gap_3().child(field("API base URL", &self.url)),
        };
        let save = Button::new("save").primary().label("Save").on_click(move |_, w, cx| {
            this.update(cx, |f, cx| f.save(w, cx));
        });
        v_flex()
            .gap_3()
            .child(inputs)
            .when_some(self.error.clone(), |d, e| d.child(div().text_sm().text_color(danger).child(e)))
            .child(h_flex().gap_2().child(save).child(Button::new("cancel").label("Cancel").on_click(|_, w, cx| w.close_sheet(cx))))
    }
}
