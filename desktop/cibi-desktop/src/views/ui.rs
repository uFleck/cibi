//! Shared view helpers: sign colours, card/row styling and the offcanvas (sheet) wrapper.
use cibi_client::format::format_money;
use gpui_kit::component::*;
use gpui_kit::*;

pub fn money(a: f64, cur: &str) -> String {
    format_money(a, cur)
}

/// Green for positive, red for negative, muted for zero (web: text-green-600 / text-red-500).
pub fn amount_color(cx: &App, a: f64) -> Hsla {
    let t = cx.theme();
    if a > 0.0 {
        t.success
    } else if a < 0.0 {
        t.danger
    } else {
        t.muted_foreground
    }
}

pub fn card(cx: &App, title: &str) -> Div {
    v_flex()
        .gap_2()
        .p_4()
        .rounded_lg()
        .border_1()
        .border_color(cx.theme().border)
        .child(div().text_xs().text_color(cx.theme().muted_foreground).child(title.to_uppercase()))
}

pub fn row(cx: &App, label: impl Into<SharedString>, value: impl Into<SharedString>) -> Div {
    h_flex()
        .justify_between()
        .gap_4()
        .child(div().text_sm().text_color(cx.theme().muted_foreground).child(label.into()))
        .child(div().text_sm().child(value.into()))
}

/// `row` with the value coloured by the sign of `amount`.
pub fn amount_row(cx: &App, label: impl Into<SharedString>, amount: f64, cur: &str) -> Div {
    h_flex()
        .justify_between()
        .gap_4()
        .child(div().text_sm().text_color(cx.theme().muted_foreground).child(label.into()))
        .child(div().text_sm().text_color(amount_color(cx, amount)).child(money(amount, cur)))
}

/// Opens `content` in an offcanvas. Forms live in their own entity (see transactions/form.rs),
/// are `load()`ed before this call and closed with `window.close_sheet(cx)` after a successful save.
pub fn open_form_sheet(window: &mut Window, cx: &mut App, title: impl Into<SharedString>, content: impl Into<AnyView>) {
    let (title, content) = (title.into(), content.into());
    window.open_sheet(cx, move |s, _, _| s.title(title.clone()).child(content.clone()));
}
