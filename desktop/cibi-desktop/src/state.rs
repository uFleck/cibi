//! Global app state. Views read it via `Entity<AppState>`; later phases add their own cached fields.
use crate::config::Config;
use cibi_client::{
    models::{AccountResponse, LedgerEntryResponse, ProfileResponse},
    Client, Error,
};
use gpui_kit::component::{Theme, ThemeMode};
use gpui_kit::*;

pub struct AppState {
    pub client: Client,
    pub config: Config,
    pub accounts: Vec<AccountResponse>,
    pub selected: Option<String>,
    /// Pending last error; the shell turns it into a toast.
    pub error: Option<String>,
    /// Settings page data (see `load_settings`); `profile_rev` bumps whenever `profile` is reloaded.
    pub profile: Option<ProfileResponse>,
    pub profile_rev: usize,
    pub ledger: Vec<LedgerEntryResponse>,
    pub public_base_url: String,
    pub pay_schedule_id: Option<String>,
    loading: usize,
    accent: u32,
}

/// (API theme id, primary color 0xRRGGBB), approximating web/src/pages/settings.tsx.
const THEMES: [(&str, u32); 5] = [
    ("green-anchor", 0x3fae4a),
    ("neutral-command", 0x3b6ea5),
    ("teal-bridge", 0x1fa3a8),
    ("warm-amber", 0xe0a020),
    ("rose-noir", 0xc2467f),
];

impl AppState {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let config = Config::load();
        let mut s = Self {
            client: Client::new(&config.base_url),
            config,
            accounts: vec![],
            selected: None,
            error: None,
            profile: None,
            profile_rev: 0,
            ledger: vec![],
            public_base_url: String::new(),
            pay_schedule_id: None,
            loading: 0,
            accent: THEMES[0].1,
        };
        s.apply_theme(cx);
        s.refresh_accounts(cx);
        s
    }

    pub fn loading(&self) -> bool {
        self.loading > 0
    }

    /// Run a blocking API call off the UI thread, then `done` on it. Errors become `self.error`.
    pub fn fetch<T: Send + 'static>(
        &mut self,
        cx: &mut Context<Self>,
        call: impl FnOnce(Client) -> Result<T, Error> + Send + 'static,
        done: impl FnOnce(&mut Self, T, &mut Context<Self>) + 'static,
    ) {
        self.loading += 1;
        cx.notify();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let res = cx.background_spawn(async move { call(client) }).await;
            this.update(cx, |s, cx| {
                s.loading -= 1;
                match res {
                    Ok(v) => done(s, v, cx),
                    Err(e) => s.error = Some(e.to_string()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    pub fn refresh_accounts(&mut self, cx: &mut Context<Self>) {
        self.fetch(cx, |c| c.fetch_accounts(), |s, accounts, cx| {
            let keep = s.selected.as_ref().filter(|id| accounts.iter().any(|a| &a.id == *id)).cloned();
            let pick = keep.or_else(|| accounts.iter().find(|a| a.is_default).or(accounts.first()).map(|a| a.id.clone()));
            s.accounts = accounts;
            s.select(pick, cx);
        });
    }

    /// Select an account and load its profile theme. Call after mutations that change it.
    pub fn select(&mut self, id: Option<String>, cx: &mut Context<Self>) {
        self.selected = id.clone();
        let Some(id) = id else { return };
        self.fetch(cx, move |c| c.fetch_profile(&id), |s, p, cx| {
            s.accent = THEMES.iter().find(|t| t.0 == p.theme).map_or(THEMES[0].1, |t| t.1);
            s.apply_theme(cx);
        });
    }

    pub fn set_dark(&mut self, dark: bool, cx: &mut Context<Self>) {
        self.config.dark = dark;
        if let Err(e) = self.config.save() {
            self.error = Some(format!("saving config: {e}"));
        }
        self.apply_theme(cx);
    }

    /// Persist a new API base URL and reload everything against it.
    pub fn set_base_url(&mut self, url: &str, cx: &mut Context<Self>) {
        self.config.base_url = url.trim().to_string();
        if let Err(e) = self.config.save() {
            self.error = Some(format!("saving config: {e}"));
        }
        self.client = Client::new(&self.config.base_url);
        self.refresh_accounts(cx);
    }

    /// Reload profile, ledger, public config and the account's first pay schedule (for income).
    pub fn load_settings(&mut self, cx: &mut Context<Self>) {
        let Some(id) = self.selected.clone() else { return };
        let a = id.clone();
        self.fetch(cx, move |c| c.fetch_profile(&a), |s, p, _| {
            s.profile = Some(p);
            s.profile_rev += 1;
        });
        let a = id.clone();
        self.fetch(cx, move |c| c.fetch_ledger(&a), |s, l, _| s.ledger = l);
        self.fetch(cx, |c| c.fetch_public_config(), |s, c, _| s.public_base_url = c.public_base_url);
        self.fetch(cx, move |c| c.list_pay_schedules(&id), |s, l, _| s.pay_schedule_id = l.first().map(|p| p.id.clone()));
    }

    fn apply_theme(&self, cx: &mut Context<Self>) {
        Theme::change(if self.config.dark { ThemeMode::Dark } else { ThemeMode::Light }, None, cx);
        let c: Hsla = rgb(self.accent).into();
        let t = Theme::global_mut(cx);
        t.primary = c;
        t.primary_hover = c.opacity(0.9);
        t.primary_active = c.opacity(0.8);
        t.ring = c;
        t.button_primary = c;
        cx.notify();
    }
}
