//! Friends page: friends CRUD, peer debts, group events (participants, transactions), summary/breakdown,
//! PIX QR and public-link copy. Mirrors web/src/pages/friends.tsx.
//! ponytail: the shell builds `Friends { state }`, so the real view lives in a keyed child entity (state resets when you leave the page).
//! Skipped: installment debts, host picker and per-participant confirmation (those are public-page flows).
use crate::state::AppState;
use cibi_client::{format::*, models::*, pix::generate_pix_payload, Client, Error};
use gpui_kit::component::{button::*, checkbox::Checkbox, input::*, notification::Notification, *};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;
use qrcode::{Color, QrCode};

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
    name: Entity<InputState>,
    pix: Entity<InputState>,
    notes: Entity<InputState>,
    d_amt: Entity<InputState>,
    d_desc: Entity<InputState>,
    qr_amt: Entity<InputState>,
    e_title: Entity<InputState>,
    e_total: Entity<InputState>,
    t_desc: Entity<InputState>,
    t_amt: Entity<InputState>,
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

fn today() -> String {
    // The Go API wants RFC3339; midnight UTC like the web date inputs.
    from_date_input_value(Some(&chrono::Utc::now().format("%Y-%m-%d").to_string())).unwrap()
}

impl View {
    fn new(state: Entity<AppState>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        cx.observe(&state, |_, _, cx| cx.notify()).detach();
        let mut input = |ph: &str| cx.new(|cx| InputState::new(window, cx).placeholder(ph.to_string()));
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
            name: input("Name"),
            pix: input("PIX key"),
            notes: input("Notes"),
            d_amt: input("Amount"),
            d_desc: input("Description"),
            qr_amt: input("QR amount (optional)"),
            e_title: input("Event title"),
            e_total: input("Total amount"),
            t_desc: input("Description"),
            t_amt: input("Whole amount"),
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

    fn clear(i: &Entity<InputState>, text: &str, window: &mut Window, cx: &mut App) {
        i.update(cx, |s, cx| s.set_value(text.to_string(), window, cx));
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

    fn pick_friend(&mut self, id: Option<String>, window: &mut Window, cx: &mut Context<Self>) {
        let f = id.as_ref().and_then(|i| self.friends.iter().find(|f| &f.id == i)).cloned().unwrap_or_default();
        Self::clear(&self.name, &f.name, window, cx);
        Self::clear(&self.pix, f.pix_key.as_deref().unwrap_or(""), window, cx);
        Self::clear(&self.notes, f.notes.as_deref().unwrap_or(""), window, cx);
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

    fn save_friend(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let name = Self::val(&self.name, cx);
        if name.is_empty() {
            return self.err(cx, "Name required");
        }
        let (pix, notes) = (Self::val(&self.pix, cx), Self::val(&self.notes, cx));
        match self.sel_friend.clone() {
            // PATCH treats "" as clearing the field.
            Some(id) => self.mutate(cx, move |c| {
                c.update_friend(&id, &PatchFriendRequest { name: Some(name), notes: Some(notes), pix_key: Some(pix) })
            }),
            None => {
                self.mutate(cx, move |c| {
                    c.create_friend(&CreateFriendRequest {
                        name,
                        notes: Some(notes).filter(|s| !s.is_empty()),
                        pix_key: Some(pix).filter(|s| !s.is_empty()),
                    })
                    .map(|_| ())
                });
                for i in [&self.name, &self.pix, &self.notes] {
                    Self::clear(i, "", window, cx);
                }
            }
        }
    }

    fn add_debt(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (Some(fid), Some(acct)) = (self.sel_friend.clone(), self.loaded.clone()) else { return };
        let desc = Self::val(&self.d_desc, cx);
        let Some(amount) = parse_decimal_input(&Self::val(&self.d_amt, cx)) else {
            return self.err(cx, "Enter a valid amount");
        };
        if desc.is_empty() {
            return self.err(cx, "Description required");
        }
        let d = CreatePeerDebtRequest { account_id: acct, friend_id: fid, amount, description: desc, date: today(), ..Default::default() };
        self.mutate(cx, move |c| c.create_peer_debt(&d).map(|_| ()));
        Self::clear(&self.d_amt, "", window, cx);
        Self::clear(&self.d_desc, "", window, cx);
    }

    fn create_event(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(acct) = self.loaded.clone() else { return };
        let title = Self::val(&self.e_title, cx);
        let Some(total) = parse_decimal_input(&Self::val(&self.e_total, cx)).filter(|t| *t > 0.0) else {
            return self.err(cx, "Please enter a valid total amount");
        };
        if title.is_empty() {
            return self.err(cx, "Title required");
        }
        let d = CreateGroupEventRequest { account_id: acct, title, date: today(), total_amount: total, notes: None };
        self.mutate(cx, move |c| c.create_group_event(&d).map(|_| ()));
        Self::clear(&self.e_title, "", window, cx);
        Self::clear(&self.e_total, "", window, cx);
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

    fn add_tx(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(ev) = self.sel_event.clone() else { return };
        let desc = Self::val(&self.t_desc, cx);
        // The API takes int64 whole units here.
        let Some(amount) = Self::val(&self.t_amt, cx).parse::<i64>().ok().filter(|a| *a > 0) else {
            return self.err(cx, "Amount must be a positive whole number");
        };
        if desc.is_empty() {
            return self.err(cx, "Description required");
        }
        self.mutate(cx, move |c| c.add_group_event_transaction(&ev, &AddTransactionRequest { description: desc, amount }).map(|_| ()));
        Self::clear(&self.t_desc, "", window, cx);
        Self::clear(&self.t_amt, "", window, cx);
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

    fn qr(&self, key: &str, cx: &App) -> impl IntoElement {
        let amount = parse_decimal_input(&Self::val(&self.qr_amt, cx));
        let payload = generate_pix_payload(key, amount, "CIBI", "SAO PAULO");
        let rows = QrCode::new(payload.as_bytes()).ok().map(|c| {
            let w = c.width();
            c.to_colors().chunks(w).map(|r| r.iter().map(|c| *c == Color::Dark).collect::<Vec<_>>()).collect::<Vec<_>>()
        });
        let cell = px(4.);
        v_flex().p_2().bg(gpui_kit::white()).children(rows.unwrap_or_default().into_iter().map(move |r| {
            h_flex().children(r.into_iter().map(move |dark| div().size(cell).bg(if dark { gpui_kit::black() } else { gpui_kit::white() })))
        }))
    }
}

fn row() -> Div {
    h_flex().gap_2().items_center()
}

impl Render for View {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let acct = self.state.read(cx).selected.clone();
        if acct != self.loaded {
            self.sel_friend = None;
            self.sel_event = None;
            self.reload(cx);
        }
        let cur = self.state.read(cx).accounts.iter().find(|a| Some(&a.id) == acct.as_ref()).map_or("BRL".into(), |a| a.currency.clone());
        let money = |v: f64| format_money(v, &cur);
        let name_of = |id: &str| self.friends.iter().find(|f| f.id == id).map_or("?".to_string(), |f| f.name.clone());
        let sel_f = self.sel_friend.as_ref().and_then(|i| self.friends.iter().find(|f| &f.id == i)).cloned();
        let sel_e = self.sel_event.as_ref().and_then(|i| self.events.iter().find(|e| &e.id == i)).cloned();

        // Summary + breakdown
        let s = &self.summary;
        let summary = v_flex()
            .gap_1()
            .child(div().text_lg().child("Summary"))
            .child(format!(
                "Owed to you {} · You owe {} · Net {} · Next payment {}",
                money(s.total_owed_to_user), money(s.total_user_owes), money(s.net), money(s.next_user_payment)
            ))
            .children(self.breakdown.iter().map(|b| {
                let inst = if b.is_installment { format!(" · {}/{} installments", b.paid_installments, b.total_installments) } else { String::new() };
                let due = b.next_payment_date.as_deref().map(|d| format!(" on {}", format_date(d))).unwrap_or_default();
                format!("{}: total {} · next {}{due}{inst}", b.friend_name, money(b.total_amount), money(b.next_payment))
            }));

        // Friends list + form
        let mut friends = v_flex().gap_2().child(div().text_lg().child("Friends")).children(self.friends.iter().map(|f| {
            let (id, tok) = (f.id.clone(), f.public_token.clone());
            row()
                .child(div().w(px(180.)).child(f.name.clone()))
                .child(Self::btn(cx, format!("of{}", f.id), "Open", move |s, w, cx| s.pick_friend(Some(id.clone()), w, cx)))
                .child(Self::btn(cx, format!("cf{}", f.id), "Copy link", move |s, w, cx| s.copy("friend", &tok, w, cx)))
        }));
        friends = friends.child(
            row()
                .child(Input::new(&self.name).w(px(160.)))
                .child(Input::new(&self.pix).w(px(160.)))
                .child(Input::new(&self.notes).w(px(160.)))
                .child(Self::btn(cx, "savef", if sel_f.is_some() { "Save friend" } else { "Add friend" }, |s, w, cx| s.save_friend(w, cx)))
                .when_some(sel_f.clone(), |d, f| {
                    d.child(Self::btn(cx, "newf", "New", |s, w, cx| s.pick_friend(None, w, cx))).child(Self::btn(cx, "delf", "Delete", move |s, w, cx| {
                        let id = f.id.clone();
                        s.confirm_delete(w, cx, format!("Delete \"{}\"?", f.name), move |s, cx| {
                            let id = id.clone();
                            s.sel_friend = None;
                            s.mutate(cx, move |c| c.delete_friend(&id));
                        });
                    }))
                }),
        );

        // Selected friend: debts + PIX
        let detail = sel_f.map(|f| {
            let debts = self.debts.iter().filter(|d| d.friend_id == f.id).map(|d| {
                let (id, ok) = (d.id.clone(), d.is_confirmed);
                let (id2, id3) = (id.clone(), id.clone());
                let inst = if d.is_installment { format!(" ({}/{})", d.paid_installments, d.total_installments.unwrap_or(0)) } else { String::new() };
                row()
                    .child(div().w(px(320.)).child(format!("{} · {} · {}{inst}", format_date(&d.date), d.description, money(d.amount))))
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
            });
            let key = f.pix_key.clone().filter(|k| !k.is_empty()).or(self.my_pix.clone());
            v_flex()
                .gap_2()
                .child(div().text_lg().child(format!("Debts with {}", f.name)))
                .children(debts)
                .child(
                    row()
                        .child(Input::new(&self.d_amt).w(px(120.)))
                        .child(Input::new(&self.d_desc).w(px(240.)))
                        .child(Self::btn(cx, "addd", "Add debt", |s, w, cx| s.add_debt(w, cx))),
                )
                .when_some(key, |d, k| {
                    d.child(div().child(format!("PIX QR for key {k}"))).child(Input::new(&self.qr_amt).w(px(200.))).child(self.qr(&k, cx))
                })
        });

        // Events
        let mut events = v_flex().gap_2().child(div().text_lg().child("Group events")).children(self.events.iter().map(|e| {
            let (id, tok) = (e.id.clone(), e.public_token.clone());
            row()
                .child(div().w(px(240.)).child(format!("{} · {} · {}", e.title, format_date(&e.date), money(e.total_amount))))
                .child(Self::btn(cx, format!("oe{}", e.id), "Open", move |s, _, cx| s.pick_event(Some(id.clone()), cx)))
                .child(Self::btn(cx, format!("ce{}", e.id), "Copy link", move |s, w, cx| s.copy("group", &tok, w, cx)))
        }));
        events = events.child(
            row()
                .child(Input::new(&self.e_title).w(px(200.)))
                .child(Input::new(&self.e_total).w(px(140.)))
                .child(Self::btn(cx, "adde", "Create event", |s, w, cx| s.create_event(w, cx))),
        );
        let event_detail = sel_e.map(|e| {
            let parts = e.participants.clone().unwrap_or_default();
            let boxes = self.friends.iter().map(|f| {
                let (fid, on) = (f.id.clone(), parts.iter().any(|p| p.friend_id.as_deref() == Some(&f.id)));
                let this = cx.entity();
                Checkbox::new(format!("p{}", f.id)).label(f.name.clone()).checked(on).on_click(move |v, _, cx| {
                    let (fid, v) = (fid.clone(), *v);
                    this.update(cx, |s, cx| s.toggle_participant(&fid, v, cx))
                })
            }).collect::<Vec<_>>();
            let txs = self.txs.iter().map(|t| {
                let (eid, tid) = (e.id.clone(), t.id.clone());
                row()
                    .child(div().w(px(300.)).child(format!("{} · {}", t.description, money(t.amount as f64))))
                    .child(Self::btn(cx, format!("rt{}", t.id), "Remove", move |s, _, cx| {
                        let (eid, tid) = (eid.clone(), tid.clone());
                        s.mutate(cx, move |c| c.remove_group_event_transaction(&eid, &tid));
                    }))
            }).collect::<Vec<_>>();
            let (eid, title) = (e.id.clone(), e.title.clone());
            let host = e.host_friend_id.as_deref().map_or("you".to_string(), |h| name_of(h));
            v_flex()
                .gap_2()
                .child(
                    row()
                        .child(div().text_lg().child(format!("{} (host: {host})", e.title)))
                        .child(Self::btn(cx, "dele", "Delete event", move |s, w, cx| {
                            let id = eid.clone();
                            s.confirm_delete(w, cx, format!("Delete \"{title}\"?"), move |s, cx| {
                                let id = id.clone();
                                s.sel_event = None;
                                s.mutate(cx, move |c| c.delete_group_event(&id));
                            });
                        })),
                )
                .child(div().child(format!("Participants (you always included, equal split of {})", money(e.total_amount))))
                .child(row().flex_wrap().children(boxes))
                .children(txs)
                .child(
                    row()
                        .child(Input::new(&self.t_desc).w(px(240.)))
                        .child(Input::new(&self.t_amt).w(px(140.)))
                        .child(Self::btn(cx, "addt", "Add transaction", |s, w, cx| s.add_tx(w, cx))),
                )
        });

        div()
            .id("friends")
            .size_full()
            .overflow_y_scroll()
            .p_6()
            .child(v_flex().gap_6().child(summary).child(friends).children(detail).child(events).children(event_detail))
    }
}
