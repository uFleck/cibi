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
}

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
        self.selected = id;
        cx.notify();
    }

    pub fn set_dark(&mut self, dark: bool, cx: &mut Context<Self>) {
        self.config.dark = dark;
        if let Err(e) = self.config.save() {
            self.error = Some(format!("saving config: {e}"));
        }
        self.apply_theme(cx);
    }

    /// Toggle close-to-tray (`login == false`) or start-at-login (`login == true`) and persist it.
    pub fn set_toggle(&mut self, login: bool, on: bool, cx: &mut Context<Self>) {
        if login {
            self.config.start_at_login = on;
            crate::background::set_autostart(on);
        } else {
            self.config.close_to_tray = on;
        }
        if let Err(e) = self.config.save() {
            self.error = Some(format!("saving config: {e}"));
        }
        cx.notify();
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

    /// Fixed CIBI palette (charcoal + gold); the per-account API theme is ignored on desktop.
    fn apply_theme(&self, cx: &mut Context<Self>) {
        let dark = self.config.dark;
        Theme::change(if dark { ThemeMode::Dark } else { ThemeMode::Light }, None, cx);
        let h = |x: u32| -> Hsla { rgb(x).into() };
        let gold = h(0xD4AF50);
        let (bg, card, text, muted, border) = if dark {
            (h(0x111111), h(0x1C1C1C), h(0xF4F0E6), h(0x8F8F8F), h(0x2C2C2C))
        } else {
            (h(0xF7F5EF), h(0xFFFFFF), h(0x111111), h(0x6B6B6B), h(0xE2DED2))
        };
        let t = Theme::global_mut(cx);
        t.background = bg;
        t.foreground = text;
        t.border = border;
        t.muted = card;
        t.muted_foreground = muted;
        t.popover = card;
        t.popover_foreground = text;
        t.input = border;
        t.secondary = card;
        t.secondary_foreground = text;
        t.accent = card;
        t.accent_foreground = text;
        t.colors.list = bg;
        t.list_hover = card;
        t.list_active = card;
        t.list_active_border = gold;
        t.sidebar = bg;
        t.sidebar_foreground = text;
        t.sidebar_border = border;
        t.sidebar_accent = card;
        t.sidebar_accent_foreground = gold;
        t.sidebar_primary = gold;
        t.sidebar_primary_foreground = h(0x111111);
        t.primary = gold;
        t.primary_hover = gold.opacity(0.9);
        t.primary_active = gold.opacity(0.8);
        t.primary_foreground = h(0x111111);
        t.button_primary = gold;
        t.button_primary_hover = gold.opacity(0.9);
        t.button_primary_active = gold.opacity(0.8);
        t.button_primary_foreground = h(0x111111);
        t.ring = gold;
        t.link = gold;
        t.success = h(0x4ADE80);
        t.danger = h(0xFB7185);
        t.warning = h(0xFBBF24);
        cx.notify();
    }
}
