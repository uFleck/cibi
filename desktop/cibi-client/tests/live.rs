//! Live API check. Run: CIBI_URL=http://localhost:42069 cargo test -p cibi-client --test live -- --ignored
//! Set CIBI_TEST_GOALS=1 to also create a goal (leaves an undeletable goal + account behind).
//! Creates a throwaway account (+ friends) and removes them; temporarily flips the default account and restores it.
use cibi_client::models::*;
use cibi_client::Client;

fn s(v: &str) -> String {
    v.to_string()
}

fn run(c: &Client, acc: &AccountResponse) {
    let a = acc.id.as_str();

    // accounts
    let u = c.update_account(a, &UpdateAccountRequest { safety_buffer: Some(10.0), ..Default::default() }).unwrap();
    assert_eq!(u.safety_buffer, 10.0);
    assert!(c.fetch_accounts().unwrap().iter().any(|x| x.id == a));
    let orig = c.fetch_default_account().unwrap();
    c.set_default_account(a).unwrap();
    assert_eq!(c.fetch_default_account().unwrap().id, a);
    c.set_default_account(&orig.id).unwrap();

    // pay schedule + income + ledger
    let ps = c
        .create_pay_schedule(&CreatePayScheduleRequest { account_id: s(a), frequency: s("monthly"), anchor_date: s("2026-10-20"), amount: 1000.0, ..Default::default() })
        .unwrap();
    c.update_pay_schedule(&ps.id, &UpdatePayScheduleRequest { frequency: s("monthly"), anchor_date: s("2026-10-20"), amount: 1000.0, label: Some(s("pay")), day_of_month_2: None }).unwrap();
    assert_eq!(c.list_pay_schedules(a).unwrap().len(), 1);
    c.record_income(&RecordIncomeRequest { account_id: s(a), pay_schedule_id: ps.id.clone(), amount: 5, description: s("bonus") }).unwrap();
    let ledger = c.fetch_ledger(a).unwrap();
    assert!(!ledger.is_empty());
    c.delete_ledger_entry(&ledger[0].id).unwrap();
    c.confirm_pay_schedule(&ps.id).unwrap();

    // transactions
    let t1 = c
        .create_transaction(&CreateTransactionRequest { account_id: s(a), amount: -20.0, description: s("one-off"), requires_confirmation: Some(true), ..Default::default() })
        .unwrap();
    let t2 = c
        .create_transaction(&CreateTransactionRequest {
            account_id: s(a), amount: -30.0, description: s("installments"), is_installment: Some(true), total_installments: Some(3),
            frequency: Some(s("monthly")), anchor_date: Some(s("2026-10-25T00:00:00Z")), ..Default::default()
        })
        .unwrap();
    let t3 = c
        .create_transaction(&CreateTransactionRequest {
            account_id: s(a), amount: -9.9, description: s("sub"), is_recurring: Some(true), frequency: Some(s("monthly")),
            anchor_date: Some(s("2026-10-22T00:00:00Z")), ..Default::default()
        })
        .unwrap();
    c.update_transaction(&t1.id, &UpdateTransactionRequest { description: Some(s("renamed")), ..Default::default() }).unwrap();
    c.confirm_transaction(&t1.id).unwrap();
    c.confirm_installment_transaction(&t2.id).unwrap();
    assert_eq!(c.fetch_transactions(a).unwrap().len(), 3);
    c.delete_transaction(&t3.id).unwrap();

    // check
    c.post_check(10.0, Some(a)).unwrap();

    // Goals have no delete endpoint and block account deletion, so only exercise them on request.
    if std::env::var("CIBI_TEST_GOALS").is_ok() {
        let g = c
            .create_goal(&CreateGoalRequest { account_id: s(a), name: s("trip"), target_amount: 100.0, start_date_utc: s("2026-10-01T00:00:00Z"), ..Default::default() })
            .unwrap();
        c.update_goal(&g.id, &UpdateGoalRequest { notes: Some(s("n")), ..Default::default() }).unwrap();
        let e = c.add_goal_ledger_entry(&g.id, &AddGoalLedgerRequest { amount: 10.0, r#type: s("contribution"), ..Default::default() }).unwrap();
        assert_eq!(c.list_goal_ledger(&g.id).unwrap().len(), 1);
        c.reverse_goal_ledger_entry(&g.id, &e.id).unwrap();
        assert_eq!(c.list_goals(a).unwrap().len(), 1);
        c.fetch_goals_tracking(a).unwrap();
        c.list_goal_recurring(a).unwrap(); // confirm_goal_recurring needs a recurring goal; no API to create one
    } else {
        c.list_goals(a).unwrap();
        c.fetch_goals_tracking(a).unwrap();
        c.list_goal_recurring(a).unwrap();
    }

    // friends, peer debts
    let f = c.create_friend(&CreateFriendRequest { name: s("zz-throwaway"), ..Default::default() }).unwrap();
    c.update_friend(&f.id, &PatchFriendRequest { pix_key: Some(s("a@b.com")), ..Default::default() }).unwrap();
    assert!(c.list_friends().unwrap().iter().any(|x| x.id == f.id));
    let d = c
        .create_peer_debt(&CreatePeerDebtRequest { account_id: s(a), friend_id: f.id.clone(), amount: 40.0, description: s("lunch"), date: s("2026-10-21T00:00:00Z"), ..Default::default() })
        .unwrap();
    c.update_peer_debt(&d.id, &PatchPeerDebtRequest { description: Some(s("dinner")), ..Default::default() }).unwrap();
    c.confirm_debt(&d.id).unwrap();
    c.toggle_debt_confirm(&d.id).unwrap();
    assert_eq!(c.list_peer_debts(a, Some(&f.id)).unwrap().len(), 1);
    c.fetch_friend_summary(a).unwrap();
    c.fetch_friend_breakdown(a).unwrap();

    // group events
    let ev = c.create_group_event(&CreateGroupEventRequest { account_id: s(a), title: s("bbq"), date: s("2026-10-23T00:00:00Z"), total_amount: 60.0, notes: None }).unwrap();
    c.update_group_event(&ev.id, &PatchGroupEventRequest { notes: Some(s("n")), ..Default::default() }).unwrap();
    let tx = c.add_group_event_transaction(&ev.id, &AddTransactionRequest { description: s("meat"), amount: 60 }).unwrap();
    assert_eq!(c.list_group_event_transactions(&ev.id).unwrap().len(), 1);
    c.set_participants(&ev.id, &SetParticipantsRequest {
        participants: vec![
            ParticipantInput { friend_id: None, share_amount: 30.0, is_confirmed: None }, // owner must be included
            ParticipantInput { friend_id: Some(f.id.clone()), share_amount: 30.0, is_confirmed: None },
        ],
        host_friend_id: None,
    })
    .unwrap();
    assert_eq!(c.get_group_event(&ev.id).unwrap().id, ev.id);
    assert_eq!(c.list_group_events(a).unwrap().len(), 1);
    c.remove_group_event_transaction(&ev.id, &tx.id).unwrap();
    c.delete_group_event(&ev.id).unwrap();

    c.delete_peer_debt(&d.id).unwrap();
    c.delete_friend(&f.id).unwrap();

    // profile, config
    c.update_profile(a, &UpdateProfileRequest { display_name: s("tmp"), theme: s("teal-bridge"), pix_key: None }).unwrap();
    assert_eq!(c.fetch_profile(a).unwrap().display_name, "tmp"); // new accounts have no profile row until first PATCH
    c.fetch_public_config().unwrap();

}

#[test]
#[ignore]
fn every_endpoint() {
    let c = Client::new(&std::env::var("CIBI_URL").expect("set CIBI_URL"));
    let acc = c
        .create_account(&CreateAccountRequest { name: s("zz-throwaway"), current_balance: 100.0, currency: s("BRL"), safety_buffer: None })
        .unwrap();
    assert_eq!(acc.current_balance, 100.0);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&c, &acc)));
    // The API has no cascade: clear children first (goals have no delete endpoint).
    for e in c.fetch_ledger(&acc.id).unwrap() {
        c.delete_ledger_entry(&e.id).unwrap();
    }
    for t in c.fetch_transactions(&acc.id).unwrap() {
        c.delete_transaction(&t.id).unwrap();
    }
    for e in c.list_group_events(&acc.id).unwrap() {
        c.delete_group_event(&e.id).unwrap();
    }
    for d in c.list_peer_debts(&acc.id, None).unwrap() {
        c.delete_peer_debt(&d.id).unwrap();
    }
    for p in c.list_pay_schedules(&acc.id).unwrap() {
        c.delete_pay_schedule(&p.id).unwrap();
    }
    c.delete_account(&acc.id).unwrap();
    if let Err(e) = r {
        std::panic::resume_unwind(e);
    }
}
