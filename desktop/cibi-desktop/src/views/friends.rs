//! Friends page: master/detail. Top: summary cards and installment plans. Left: friend list.
//! Right: selected friend's debts and PIX QR. Bottom: group events accordion. Every form (friend, debt,
//! event, event transaction) lives in a sheet (`friends/form.rs`). Mirrors web/src/pages/friends.tsx.
//! ponytail: the shell builds `Friends { state }`, so the real view lives in a keyed child entity (state resets when you leave the page).
//! Skipped: installment debts, host picker and per-participant confirmation (those are public-page flows).
mod form;

use crate::state::AppState;
use crate::views::ui::{amount_color, card, open_form_sheet, row};
use cibi_client::{format::*, models::*, pix::generate_pix_payload, Client, Error};
use form::{Form, Kind};
use gpui_kit::component::{accordion::Accordion, button::*, checkbox::Checkbox, input::{InputEvent, InputState, Input}, notification::Notification, tag::Tag, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;
use qrcode::{Color, QrCode};

/// Fixed square size of the PIX QR card (the old one stretched to full width).
const QR_SIZE: f32 = 180.;

pub struct Friends {
    pub state: Entity<AppState>,
}

impl Render for Friends {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let state = self.state.clone();
        window.use_keyed_state("friends-view", cx, |w, cx| View::new(state, w, cx))
    }
}

struct View {
    state: Entity<AppState>,
    loaded: Option<String>,
    friends: Vec<FriendResponse>,
    summary: FriendSummaryResponse,
    breakdown: Vec<FriendDebtBreakdownItem>,
    debts: Vec<PeerDebtResponse>,
    events: Vec<GroupEventResponse>,
    txs: Vec<GroupEventTransactionResponse>,
    my_pix: Option<String>,
    public_base: String,
    sel_friend: Option<String>,
    sel_event: Option<String>,
    events_open: bool,
    qr_amt: Entity<InputState>,
    form: Entity<Form>,
}

type Data = (
    Vec<FriendResponse>,
    FriendSummaryResponse,
    Vec<FriendDebtBreakdownItem>,
    Vec<PeerDebtResponse>,
    Vec<GroupEventResponse>,
    ProfileResponse,
    PublicConfigResponse,
    Vec<GroupEventTransactionResponse>,
);

impl View {
    fn new(state: Entity<AppState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        cx.observe(&state, |_, _, cx| cx.notify()).detach();
        let page = cx.weak_entity();
        let qr_amt = cx.new(|cx| InputState::new(window, cx).placeholder("QR amount (optional)"));
        cx.subscribe(&qr_amt, |_, _, _: &InputEvent, cx| cx.notify()).detach();
        Self {
            state,
            loaded: None,
            friends: vec![],
            summary: Default::default(),
            breakdown: vec![],
            debts: vec![],
            events: vec![],
            txs: vec![],
            my_pix: None,
            public_base: String::new(),
            sel_friend: None,
            sel_event: None,
            events_open: false,
            qr_amt,
            form: cx.new(|cx| Form::new(page, window, cx)),
        }
    }

    fn err(&self, cx: &mut Context<Self>, msg: &str) {
        self.state.update(cx, |s, cx| {
            s.error = Some(msg.into());
            cx.notify();
        });
    }

    fn val(i: &Entity<InputState>, cx: &App) -> String {
        i.read(cx).value().trim().to_string()
    }

    fn cur(&self, cx: &App) -> String {
        let acct = self.state.read(cx).selected.clone();
        self.state.read(cx).accounts.iter().find(|a| Some(&a.id) == acct.as_ref()).map_or("BRL".into(), |a| a.currency.clone())
    }

    /// Run a blocking API call in the background; errors become toasts via AppState.
    fn run<T: Send + 'static>(
        &mut self,
        cx: &mut Context<Self>,
        call: impl FnOnce(Client) -> Result<T, Error> + Send + 'static,
        done: impl FnOnce(&mut Self, T, &mut Context<Self>) + 'static,
    ) {
        let client = self.state.read(cx).client.clone();
        let state = self.state.clone();
        cx.spawn(async move |this, cx| {
            let res = cx.background_spawn(async move { call(client) }).await;
            this.update(cx, |s, cx| match res {
                Ok(v) => done(s, v, cx),
                Err(e) => state.update(cx, |st, cx| {
                    st.error = Some(e.to_string());
                    cx.notify();
                }),
            })
            .ok();
        })
        .detach();
    }

    fn mutate(&mut self, cx: &mut Context<Self>, call: impl FnOnce(Client) -> Result<(), Error> + Send + 'static) {
        self.run(cx, call, |s, _, cx| s.reload(cx));
    }

    fn reload(&mut self, cx: &mut Context<Self>) {
        let Some(acct) = self.state.read(cx).selected.clone() else { return };
        self.loaded = Some(acct.clone());
        let ev = self.sel_event.clone();
        self.run(
            cx,
            move |c| -> Result<Data, Error> {
                let txs = match &ev {
                    Some(e) => c.list_group_event_transactions(e)?,
                    None => vec![],
                };
                Ok((
                    c.list_friends()?,
                    c.fetch_friend_summary(&acct)?,
                    c.fetch_friend_breakdown(&acct)?,
                    c.list_peer_debts(&acct, None)?,
                    c.list_group_events(&acct)?,
                    c.fetch_profile(&acct)?,
                    c.fetch_public_config()?,
                    txs,
                ))
            },
            |s, d, cx| {
                (s.friends, s.summary, s.breakdown, s.debts, s.events) = (d.0, d.1, d.2, d.3, d.4);
                (s.my_pix, s.public_base, s.txs) = (d.5.pix_key.filter(|k| !k.is_empty()), d.6.public_base_url, d.7);
                cx.notify();
            },
        );
    }

    fn pick_friend(&mut self, id: Option<String>, cx: &mut Context<Self>) {
        self.sel_friend = id;
        cx.notify();
    }

    fn pick_event(&mut self, id: Option<String>, cx: &mut Context<Self>) {
        self.sel_event = id;
        self.txs.clear();
        self.reload(cx);
    }

    fn copy(&mut self, path: &str, token: &str, window: &mut Window, cx: &mut Context<Self>) {
        if self.public_base.is_empty() {
            return self.err(cx, "Public base URL is not configured");
        }
        let link = format!("{}/public/{path}/{token}", self.public_base.trim_end_matches('/'));
        cx.write_to_clipboard(ClipboardItem::new_string(link));
        window.push_notification(Notification::success("Link copied"), cx);
    }

    fn open_form(&mut self, kind: Kind, title: &str, window: &mut Window, cx: &mut Context<Self>) {
        let account = self.loaded.clone().unwrap_or_default();
        let form = self.form.clone();
        form.update(cx, |f, cx| f.load(kind, account, window, cx));
        open_form_sheet(window, cx, title.to_string(), form);
    }

    /// Sum of one friend's debts (positive = they owe you, same sign as the API's per-friend net).
    fn friend_net(&self, id: &str) -> f64 {
        self.debts.iter().filter(|d| d.friend_id == id).map(|d| d.amount).sum()
    }

    /// Replace the participant list; the owner (friend_id None) always stays, shares split equally.
    fn toggle_participant(&mut self, friend: &str, on: bool, cx: &mut Context<Self>) {
        let Some(ev) = self.events.iter().find(|e| Some(&e.id) == self.sel_event.as_ref()) else { return };
        let cur = ev.participants.clone().unwrap_or_default();
        let mut ids: Vec<Option<String>> = vec![None];
        ids.extend(cur.iter().filter_map(|p| p.friend_id.clone()).filter(|f| f != friend).map(Some));
        if on {
            ids.push(Some(friend.to_string()));
        }
        let share = ev.total_amount / ids.len() as f64;
        let participants = ids
            .into_iter()
            .map(|friend_id| ParticipantInput {
                is_confirmed: cur.iter().find(|p| p.friend_id == friend_id).map(|p| p.is_confirmed),
                friend_id,
                share_amount: share,
            })
            .collect();
        let (id, host) = (ev.id.clone(), ev.host_friend_id.clone());
        self.mutate(cx, move |c| c.set_participants(&id, &SetParticipantsRequest { participants, host_friend_id: host }));
    }

    fn confirm_delete(&self, window: &mut Window, cx: &mut Context<Self>, title: String, f: impl Fn(&mut Self, &mut Context<Self>) + Clone + 'static) {
        let this = cx.entity();
        window.open_alert_dialog(cx, move |a, _, _| {
            let (this, f) = (this.clone(), f.clone());
            a.confirm().title(title.clone()).ok_text("Delete").on_ok(move |_, _, cx| {
                this.update(cx, |s, cx| f(s, cx));
                true
            })
        });
    }

    fn btn(cx: &mut Context<Self>, id: impl Into<ElementId>, label: &str, f: impl Fn(&mut Self, &mut Window, &mut Context<Self>) + 'static) -> Button {
        let this = cx.entity();
        Button::new(id).small().label(label.to_string()).on_click(move |_, w, cx| this.update(cx, |s, cx| f(s, w, cx)))
    }

    /// Fixed-size square QR: the quiet zone is the card padding, cells divide the rest evenly.
    fn qr(&self, key: &str, cx: &App) -> impl IntoElement {
        let amount = parse_decimal_input(&Self::val(&self.qr_amt, cx));
        let payload = generate_pix_payload(key, amount, "CIBI", "SAO PAULO");
        let rows = QrCode::new(payload.as_bytes()).ok().map(|c| {
            let w = c.width();
            c.to_colors().chunks(w).map(|r| r.iter().map(|c| *c == Color::Dark).collect::<Vec<_>>()).collect::<Vec<_>>()
        });
        let n = rows.as_ref().map_or(1, |r| r.len()).max(1) as f32;
        let cell = px((QR_SIZE - 24.) / n);
        v_flex().size(px(QR_SIZE)).flex_none().p_3().bg(gpui_kit::white()).children(rows.unwrap_or_default().into_iter().map(move |r| {
            h_flex().children(r.into_iter().map(move |dark| div().size(cell).bg(if dark { gpui_kit::black() } else { gpui_kit::white() })))
        }))
    }

    fn friend_detail(&self, f: &FriendResponse, cx: &mut Context<Self>) -> Div {
        let cur = self.cur(cx);
        let money = |v: f64| format_money(v, &cur);
        let muted = cx.theme().muted_foreground;
        let key = f.pix_key.clone().filter(|k| !k.is_empty());

        let (fe, fname, fid) = (f.clone(), f.name.clone(), f.id.clone());
        let header = h_flex()
            .justify_between()
            .items_center()
            .child(
                v_flex()
                    .child(div().text_lg().child(f.name.clone()))
                    .child(div().text_sm().text_color(muted).child(key.clone().unwrap_or_else(|| "No PIX key".into()))),
            )
            .child(
                h_flex()
                    .gap_2()
                    .child(Self::btn(cx, "editf", "Edit", move |s, w, cx| s.open_form(Kind::Friend(Some(fe.clone())), "Edit friend", w, cx)))
                    .child(Self::btn(cx, "delf", "Delete", move |s, w, cx| {
                        let id = fid.clone();
                        s.confirm_delete(w, cx, format!("Delete \"{fname}\"?"), move |s, cx| {
                            let id = id.clone();
                            s.sel_friend = None;
                            s.mutate(cx, move |c| c.delete_friend(&id));
                        });
                    })),
            );

        let debts: Vec<_> = self
            .debts
            .iter()
            .filter(|d| d.friend_id == f.id)
            .map(|d| {
                let (id, ok, amount) = (d.id.clone(), d.is_confirmed, d.amount);
                let (id2, id3) = (id.clone(), id.clone());
                let inst = if d.is_installment { format!(" ({}/{})", d.paid_installments, d.total_installments.unwrap_or(0)) } else { String::new() };
                h_flex()
                    .gap_3()
                    .items_center()
                    .child(div().w(px(90.)).text_sm().text_color(muted).child(format_date(&d.date)))
                    .child(div().flex_1().text_sm().child(format!("{}{inst}", d.description)))
                    .child(div().w(px(110.)).text_sm().text_color(amount_color(cx, amount)).child(money(amount)))
                    .child(if ok { Tag::success().small().child("Confirmed") } else { Tag::warning().small().child("Pending") })
                    .child(Self::btn(cx, format!("cd{id}"), if ok { "Unconfirm" } else { "Confirm" }, move |s, _, cx| {
                        let id = id2.clone();
                        s.mutate(cx, move |c| if ok { c.toggle_debt_confirm(&id) } else { c.confirm_debt(&id) });
                    }))
                    .child(Self::btn(cx, format!("dd{id3}"), "Delete", move |s, w, cx| {
                        let id = id3.clone();
                        s.confirm_delete(w, cx, "Delete this debt?".into(), move |s, cx| {
                            let id = id.clone();
                            s.mutate(cx, move |c| c.delete_peer_debt(&id));
                        });
                    }))
            })
            .collect();
        let no_debts = debts.is_empty();
        let debts_card = card(cx, "Debts")
            .child(h_flex().justify_end().child(Self::btn(cx, "addd", "Add debt", move |s, w, cx| {
                let id = s.sel_friend.clone().unwrap_or_default();
                s.open_form(Kind::Debt(id), "Add debt", w, cx)
            })))
            .children(debts)
            .when(no_debts, |d| d.child(div().text_sm().text_color(muted).child("No debts yet")));

        let pix_key = key.or(self.my_pix.clone());
        let qr = match &pix_key {
            Some(k) => self.qr(k, cx).into_any_element(),
            None => div().text_sm().text_color(muted).child("No PIX key to show").into_any_element(),
        };
        let copy_key = pix_key.clone().unwrap_or_default();
        let pix_card = card(cx, "PIX QR").child(
            h_flex()
                .gap_4()
                .items_start()
                .child(qr)
                .child(
                    v_flex()
                        .gap_2()
                        .flex_1()
                        .child(Input::new(&self.qr_amt).w(px(200.)))
                        .when(pix_key.is_some(), |d| {
                            d.child(Self::btn(cx, "copyk", "Copy PIX key", move |_, w, cx| {
                                cx.write_to_clipboard(ClipboardItem::new_string(copy_key.clone()));
                                w.push_notification(Notification::success("PIX key copied"), cx);
                            }))
                        }),
                ),
        );

        v_flex().gap_4().flex_1().min_w_0().child(header).child(debts_card).child(pix_card)
    }

    fn events_body(&self, cx: &mut Context<Self>) -> Div {
        let muted = cx.theme().muted_foreground;
        let cur = self.cur(cx);
        let money = |v: f64| format_money(v, &cur);
        let rows: Vec<_> = self
            .events
            .iter()
            .map(|e| {
                let (id, tok) = (e.id.clone(), e.public_token.clone());
                h_flex()
                    .gap_2()
                    .items_center()
                    .child(
                        v_flex()
                            .flex_1()
                            .min_w_0()
                            .child(div().text_sm().child(e.title.clone()))
                            .child(div().text_xs().text_color(muted).child(format!("{} · {}", format_date(&e.date), money(e.total_amount)))),
                    )
                    .child(Self::btn(cx, format!("oe{}", e.id), "Open", move |s, _, cx| s.pick_event(Some(id.clone()), cx)))
                    .child(Self::btn(cx, format!("ce{}", e.id), "Copy link", move |s, w, cx| s.copy("group", &tok, w, cx)))
            })
            .collect();
        let sel = self.sel_event.as_ref().and_then(|i| self.events.iter().find(|e| &e.id == i)).cloned();
        let mut body = v_flex()
            .gap_3()
            .child(h_flex().justify_end().child(Self::btn(cx, "newe", "New event", |s, w, cx| s.open_form(Kind::Event, "New event", w, cx))))
            .children(rows);
        if let Some(e) = sel {
            body = body.child(self.event_detail(&e, cx));
        }
        body
    }

    fn event_detail(&self, e: &GroupEventResponse, cx: &mut Context<Self>) -> Div {
        let muted = cx.theme().muted_foreground;
        let cur = self.cur(cx);
        let money = |v: f64| format_money(v, &cur);
        let parts = e.participants.clone().unwrap_or_default();
        let boxes: Vec<_> = self
            .friends
            .iter()
            .map(|f| {
                let (fid, on) = (f.id.clone(), parts.iter().any(|p| p.friend_id.as_deref() == Some(&f.id)));
                let this = cx.entity();
                Checkbox::new(format!("p{}", f.id)).label(f.name.clone()).checked(on).on_click(move |v, _, cx| {
                    let (fid, v) = (fid.clone(), *v);
                    this.update(cx, |s, cx| s.toggle_participant(&fid, v, cx))
                })
            })
            .collect();
        let txs: Vec<_> = self
            .txs
            .iter()
            .map(|t| {
                let (eid, tid) = (e.id.clone(), t.id.clone());
                h_flex()
                    .gap_2()
                    .items_center()
                    .child(div().flex_1().text_sm().child(t.description.clone()))
                    .child(div().text_sm().text_color(amount_color(cx, t.amount as f64)).child(money(t.amount as f64)))
                    .child(Self::btn(cx, format!("rt{}", t.id), "Remove", move |s, _, cx| {
                        let (eid, tid) = (eid.clone(), tid.clone());
                        s.mutate(cx, move |c| c.remove_group_event_transaction(&eid, &tid));
                    }))
            })
            .collect();
        let host = e.host_friend_id.as_deref().and_then(|h| self.friends.iter().find(|f| f.id == h)).map_or("you".to_string(), |f| f.name.clone());
        let (eid, title, id) = (e.id.clone(), e.title.clone(), e.id.clone());
        v_flex()
            .gap_3()
            .child(
                h_flex()
                    .justify_between()
                    .child(div().text_lg().child(format!("{} (host: {host})", e.title)))
                    .child(Self::btn(cx, "dele", "Delete event", move |s, w, cx| {
                        let (id, title) = (eid.clone(), title.clone());
                        s.confirm_delete(w, cx, format!("Delete \"{title}\"?"), move |s, cx| {
                            let id = id.clone();
                            s.sel_event = None;
                            s.mutate(cx, move |c| c.delete_group_event(&id));
                        });
                    })),
            )
            .child(div().text_sm().text_color(muted).child(format!("Participants (you always included, equal split of {})", money(e.total_amount))))
            .child(h_flex().flex_wrap().gap_3().children(boxes))
            .children(txs)
            .child(h_flex().justify_end().child(Self::btn(cx, "addt", "Add transaction", move |s, w, cx| {
                let ev = id.clone();
                s.open_form(Kind::Tx(ev), "Add transaction", w, cx)
            })))
    }
}

impl Render for View {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let acct = self.state.read(cx).selected.clone();
        if acct != self.loaded {
            self.sel_friend = None;
            self.sel_event = None;
            self.reload(cx);
        }
        let cur = self.cur(cx);
        let money = |v: f64| format_money(v, &cur);
        let muted = cx.theme().muted_foreground;
        let (sec, danger) = (cx.theme().secondary, cx.theme().danger);
        let sel_f = self.sel_friend.as_ref().and_then(|i| self.friends.iter().find(|f| &f.id == i)).cloned();

        // Owed/net follow the sign; "You owe" and "Next payment" are always costs (danger).
        let s = &self.summary;
        let stat = |cx: &App, title: &str, value: String, color: Hsla| card(cx, title).flex_1().child(div().text_lg().text_color(color).child(value));
        let summary = h_flex()
            .gap_3()
            .child(stat(cx, "Owed to you", money(s.total_owed_to_user), amount_color(cx, s.total_owed_to_user)))
            .child(stat(cx, "You owe", money(s.total_user_owes), danger))
            .child(stat(cx, "Net", money(s.net), amount_color(cx, s.net)))
            .child(stat(cx, "Next payment", money(s.next_user_payment), danger));

        let plans = card(cx, "Installments & next payments")
            .children(self.breakdown.iter().map(|b| {
                let inst = if b.is_installment {
                    format!(" · {}/{} installments · {} each", b.paid_installments, b.total_installments, money(b.per_install_amount))
                } else {
                    String::new()
                };
                let due = b.next_payment_date.as_deref().map(|d| format!(" on {}", format_date(d))).unwrap_or_default();
                row(cx, format!("{} · total {}", b.friend_name, money(b.total_amount)), format!("next {}{due}{inst}", money(b.next_payment)))
            }))
            .when(self.breakdown.is_empty(), |d| d.child(div().text_sm().text_color(muted).child("No balances yet")));

        let friends = card(cx, "Friends")
            .w(px(300.))
            .flex_none()
            .child(h_flex().justify_end().child(Self::btn(cx, "newf", "New friend", |s, w, cx| s.open_form(Kind::Friend(None), "New friend", w, cx))))
            .children(self.friends.iter().map(|f| {
                let (id, tok) = (f.id.clone(), f.public_token.clone());
                let net = self.friend_net(&f.id);
                let selected = sel_f.as_ref().is_some_and(|s| s.id == f.id);
                v_flex()
                    .gap_1()
                    .p_2()
                    .rounded_md()
                    .when(selected, |d| d.bg(sec))
                    .child(
                        h_flex()
                            .justify_between()
                            .child(div().text_sm().child(f.name.clone()))
                            .child(div().text_sm().text_color(amount_color(cx, net)).child(money(net))),
                    )
                    .child(
                        h_flex()
                            .gap_1()
                            .child(Self::btn(cx, format!("of{}", f.id), "Open", move |s, _, cx| s.pick_friend(Some(id.clone()), cx)))
                            .child(Self::btn(cx, format!("cf{}", f.id), "Copy link", move |s, w, cx| s.copy("friend", &tok, w, cx))),
                    )
            }));

        let detail = match sel_f {
            Some(f) => self.friend_detail(&f, cx),
            None => v_flex().flex_1().child(div().text_sm().text_color(muted).child("Select a friend to see debts and the PIX QR")),
        };

        let this = cx.entity();
        let body = self.events_body(cx);
        let events = Accordion::new("events")
            .on_toggle_click(move |open: &[usize], _, cx| {
                let o = !open.is_empty();
                this.update(cx, |s, cx| {
                    s.events_open = o;
                    cx.notify();
                })
            })
            .item(|item| item.title(div().child(format!("Group events ({})", self.events.len()))).open(self.events_open).child(body));

        div()
            .id("friends")
            .size_full()
            .overflow_y_scroll()
            .p_6()
            .child(
                v_flex()
                    .gap_6()
                    .child(summary)
                    .child(plans)
                    .child(h_flex().gap_4().items_start().child(friends).child(detail))
                    .child(events),
            )
    }
}
