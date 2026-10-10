#![windows_subsystem = "windows"]
mod background;
mod config;
mod shell;
mod state;
mod views;

use gpui_kit::*;

fn main() {
    let inst = single_instance::SingleInstance::new("cibi-desktop").expect("single-instance");
    if !inst.is_single() && std::env::var_os("CIBI_START_VIEW").is_none() {
        return;
    }
    gpui_kit::application().run(|cx| {
        gpui_kit::init(cx);
        views::transactions::bind_keys(cx);
        let opts = WindowOptions { window_bounds: Some(WindowBounds::Windowed(Bounds::centered(None, size(px(1200.), px(760.)), cx))), ..Default::default() };
        gpui_kit::open_window(opts, cx, |window, cx| cx.new(|cx| shell::Shell::new(window, cx)))
            .expect("failed to open window");
        cx.activate(true);
    });
}
