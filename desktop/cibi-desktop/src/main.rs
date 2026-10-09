#![windows_subsystem = "windows"]
mod background;
mod config;
mod shell;
mod state;
mod views;

use gpui_kit::*;

fn main() {
    let inst = single_instance::SingleInstance::new("cibi-desktop").expect("single-instance");
    if !inst.is_single() {
        return;
    }
    gpui_kit::application().run(|cx| {
        gpui_kit::init(cx);
        views::transactions::bind_keys(cx);
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| cx.new(|cx| shell::Shell::new(window, cx)))
            .expect("failed to open window");
        cx.activate(true);
    });
}
