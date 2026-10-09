//! Tray icon, hide/show, start-at-login and due-item toasts.
use cibi_client::Client;
use gpui_kit::Window;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::collections::HashSet;
use tray_icon::{
    menu::{Menu, MenuEvent, MenuId, MenuItem},
    Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE, SW_RESTORE};

pub enum Cmd {
    Show,
    Quit,
}

pub struct Tray(TrayIcon);

const SHOW: &str = "show";
const QUIT: &str = "quit";

impl Tray {
    pub fn new() -> Self {
        let menu = Menu::new();
        menu.append_items(&[&MenuItem::with_id(MenuId::new(SHOW), "Show", true, None), &MenuItem::with_id(MenuId::new(QUIT), "Quit", true, None)])
            .expect("tray menu");
        let rgba = [0x3f, 0xae, 0x4a, 0xff].repeat(16 * 16);
        Self(
            TrayIconBuilder::new()
                .with_menu(Box::new(menu))
                .with_menu_on_left_click(false)
                .with_tooltip("CIBI")
                .with_icon(Icon::from_rgba(rgba, 16, 16).expect("icon"))
                .build()
                .expect("tray icon"),
        )
    }
}

/// Next pending tray action (menu item or left click), if any.
pub fn poll_tray() -> Option<Cmd> {
    while let Ok(e) = MenuEvent::receiver().try_recv() {
        return Some(if e.id.0 == QUIT { Cmd::Quit } else { Cmd::Show });
    }
    while let Ok(e) = TrayIconEvent::receiver().try_recv() {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
            return Some(Cmd::Show);
        }
    }
    None
}

pub fn show(window: &Window, visible: bool) {
    if let Ok(RawWindowHandle::Win32(h)) = HasWindowHandle::window_handle(window).map(|h| h.as_raw()) {
        unsafe { ShowWindow(h.hwnd.get() as _, if visible { SW_RESTORE } else { SW_HIDE }) };
    }
}

pub fn set_autostart(on: bool) {
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let mut c = std::process::Command::new("reg");
    if on {
        let exe = std::env::current_exe().unwrap_or_default();
        c.args(["add", key, "/v", "CIBI", "/t", "REG_SZ", "/f", "/d"]).arg(format!("\"{}\"", exe.display()));
    } else {
        c.args(["delete", key, "/v", "CIBI", "/f"]);
    }
    use std::os::windows::process::CommandExt;
    let _ = c.creation_flags(0x0800_0000).output(); // CREATE_NO_WINDOW
}

/// Ids of due items not in `seen`: unconfirmed pending transactions dated today or earlier, overdue goal contributions.
pub fn due(c: &Client, seen: &HashSet<String>) -> Vec<String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut ids = vec![];
    for a in c.fetch_accounts().unwrap_or_default() {
        for t in c.fetch_transactions(&a.id).unwrap_or_default() {
            let d = t.anchor_date.clone().filter(|s| !s.is_empty()).unwrap_or(t.timestamp.clone());
            if !t.is_recurring && t.requires_confirmation && t.confirmed_at.is_none() && d.get(..10).is_some_and(|d| d <= today.as_str()) {
                ids.push(t.id);
            }
        }
        ids.extend(c.list_goal_recurring(&a.id).unwrap_or_default().into_iter().filter(|r| r.is_overdue).map(|r| r.id));
    }
    ids.retain(|i| !seen.contains(i));
    ids
}

pub fn toast(n: usize) {
    let _ = notify_rust::Notification::new().summary("CIBI").body(&format!("{n} item(s) due")).show();
}
