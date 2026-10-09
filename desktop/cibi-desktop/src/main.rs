mod config;
mod shell;
mod state;
mod views;

use gpui_kit::*;

fn main() {
    gpui_kit::application().run(|cx| {
        gpui_kit::init(cx);
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| cx.new(|cx| shell::Shell::new(window, cx)))
            .expect("failed to open window");
        cx.activate(true);
    });
}
