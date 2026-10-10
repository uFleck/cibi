//! One ledger entry: date (muted), description, humanised type tag, amount coloured by sign.
//! Shared by the dashboard "Recent activity" card and Transactions > Recent activity.
use super::ui::{amount_color, money};
use cibi_client::{format::format_date, models::LedgerEntryResponse};
use gpui_kit::component::{tag::Tag, *};
use gpui_kit::*;

pub fn ledger_row(cx: &App, e: &LedgerEntryResponse, cur: &str) -> Div {
    let sign = if e.amount > 0.0 { "+" } else { "" };
    h_flex()
        .justify_between()
        .items_center()
        .gap_3()
        .py_1()
        .child(
            v_flex()
                .flex_1()
                .min_w_0()
                .child(div().text_xs().text_color(cx.theme().muted_foreground).child(format_date(&e.posted_at)))
                .child(
                    h_flex()
                        .gap_2()
                        .min_w_0()
                        .child(div().truncate().child(e.description.clone()))
                        .child(Tag::secondary().small().child(e.entry_type.replace('_', " "))),
                ),
        )
        .child(
            div()
                .font_weight(FontWeight::MEDIUM)
                .flex_shrink_0()
                .text_color(amount_color(cx, e.amount))
                .child(format!("{sign}{}", money(e.amount, cur))),
        )
}
