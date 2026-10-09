//! Window shell: sidebar (account selector + nav) and the active view.
use crate::{background, state::AppState};
use crate::views::{accounts::Accounts, dashboard::Dashboard, friends::Friends, goals::Goals, settings::Settings, transactions::Transactions};
use gpui_kit::component::{button::*, notification::Notification, sidebar::*, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

#[derive(Clone, Copy, PartialEq)]
enum Page {
    Dashboard,
    Accounts,
    Transactions,
    Friends,
    Goals,
    Settings,
}

const NAV: [(Page, &str); 6] = [
    (Page::Dashboard, "Dashboard"),
    (Page::Accounts, "Accounts"),
    (Page::Transactions, "Transactions"),
    (Page::Friends, "Friends"),
    (Page::Goals, "Goals"),
    (Page::Settings, "Settings"),
];

pub struct Shell {
    state: Entity<AppState>,
    page: Page,
    views: [AnyView; 6],
    _tray: background::Tray,
}

impl Shell {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let state = cx.new(AppState::new);
        // Error toasts: AppState parks the last error, we show and clear it.
        cx.observe_in(&state, window, |_, state, window, cx| {
            if let Some(e) = state.update(cx, |s, _| s.error.take()) {
                window.push_notification(Notification::error(e), cx);
            }
        })
        .detach();
        let s = || state.clone();
        let views = [
            cx.new(|_| Dashboard { state: s() }).into(),
            cx.new(|_| Accounts { state: s() }).into(),
            cx.new(|_| Transactions { state: s() }).into(),
            cx.new(|_| Friends { state: s() }).into(),
            cx.new(|_| Goals { state: s() }).into(),
            cx.new(|cx| Settings::new(s(), window, cx)).into(),
        ];
        let hidden = std::rc::Rc::new(std::cell::Cell::new(false));
        let (st, h) = (state.clone(), hidden.clone());
        window.on_window_should_close(cx, move |w, cx| {
            if !st.read(cx).config.close_to_tray {
                return true;
            }
            background::show(w, false);
            h.set(true);
            false
        });
        let tray = background::Tray::new();
        let ex = cx.background_executor().clone();
        let (st, h, ex2) = (state.clone(), hidden.clone(), ex.clone());
        // Tray menu / click events.
        cx.spawn_in(window, async move |_, cx| loop {
            ex.timer(std::time::Duration::from_millis(200)).await;
            match background::poll_tray() {
                Some(background::Cmd::Show) => {
                    h.set(false);
                    cx.update(|w, cx| {
                        background::show(w, true);
                        cx.activate(true);
                    })
                    .ok();
                }
                Some(background::Cmd::Quit) => {
                    cx.update(|_, cx| cx.quit()).ok();
                }
                None => {}
            }
        })
        .detach();
        // Due-item toasts while hidden; each id is announced once.
        cx.spawn(async move |_, cx| {
            let mut seen = std::collections::HashSet::new();
            loop {
                if hidden.get() {
                    let client = Some(st.read_with(cx, |s, _| s.client.clone()));
                    let known = seen.clone();
                    if let Some(c) = client {
                        let fresh: Vec<String> = cx.background_spawn(async move { background::due(&c, &known) }).await;
                        if !fresh.is_empty() {
                            seen.extend(fresh.iter().cloned());
                            background::toast(fresh.len());
                        }
                    }
                }
                ex2.timer(std::time::Duration::from_secs(300)).await;
            }
        })
        .detach();
        Self { state, page: Page::Dashboard, views, _tray: tray }
    }
}

impl Render for Shell {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let st = self.state.read(cx);
        let (dark, loading) = (st.config.dark, st.loading());
        let accounts = SidebarMenu::new().children(st.accounts.iter().map(|a| {
            let (id, state) = (a.id.clone(), self.state.clone());
            SidebarMenuItem::new(format!("{} · {}", a.name, a.currency))
                .active(st.selected.as_deref() == Some(&a.id))
                .on_click(move |_, _, cx| state.update(cx, |s, cx| s.select(Some(id.clone()), cx)))
        }));
        let nav = SidebarMenu::new().children(NAV.iter().map(|&(page, label)| {
            let this = cx.entity();
            SidebarMenuItem::new(label).active(self.page == page).on_click(move |_, _, cx| {
                this.update(cx, |s, cx| {
                    s.page = page;
                    cx.notify();
                })
            })
        }));
        let state = self.state.clone();
        let footer = h_flex()
            .gap_2()
            .child(Button::new("theme").ghost().label(if dark { "Light mode" } else { "Dark mode" }).on_click(
                move |_, _, cx| state.update(cx, |s, cx| s.set_dark(!s.config.dark, cx)),
            ))
            .when(loading, |d| d.child("Loading…"));
        let idx = NAV.iter().position(|n| n.0 == self.page).unwrap();
        h_flex()
            .size_full()
            .child(
                Sidebar::new("nav")
                    .collapsible(false)
                    .header(div().child("CIBI").text_lg().font_weight(FontWeight::BOLD))
                    .child(accounts)
                    .child(nav)
                    .footer(footer),
            )
            .child(div().flex_1().h_full().child(self.views[idx].clone()))
    }
}
