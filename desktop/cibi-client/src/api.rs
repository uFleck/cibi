//! Blocking HTTP client, one method per web/src/lib/api.ts function (public/* excluded).
//! Call from GPUI's background executor (`cx.background_spawn`), not the UI thread.
use crate::models::*;
use reqwest::{blocking, Method};
use serde::{de::{DeserializeOwned, IgnoredAny}, Serialize};
use serde_json::Value;

#[derive(Debug)]
pub enum Error {
    /// Non-2xx response; `code` is the API's machine code (e.g. PAY_SCHEDULE_REQUIRED).
    Api { status: u16, message: String, code: Option<String> },
    Http(reqwest::Error),
    Decode(serde_json::Error),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Api { message, .. } => f.write_str(message),
            Error::Http(e) => write!(f, "{e}"),
            Error::Decode(e) => write!(f, "bad response: {e}"),
        }
    }
}
impl std::error::Error for Error {}
impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Error::Http(e)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone)]
pub struct Client {
    base: String,
    http: blocking::Client,
}

fn body<S: Serialize>(s: &S) -> Option<Value> {
    Some(serde_json::to_value(s).expect("request serializes"))
}

impl Client {
    pub fn new(base_url: &str) -> Self {
        Self { base: base_url.trim_end_matches('/').to_string(), http: blocking::Client::new() }
    }

    pub fn base_url(&self) -> &str {
        &self.base
    }

    fn call<T: DeserializeOwned>(&self, m: Method, path: &str, q: &[(&str, &str)], b: Option<Value>) -> Result<T> {
        let mut req = self.http.request(m, format!("{}{path}", self.base)).query(q);
        if let Some(b) = b {
            req = req.json(&b);
        }
        let res = req.send()?;
        let status = res.status();
        let text = res.text()?;
        if !status.is_success() {
            let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            return Err(Error::Api {
                status: status.as_u16(),
                message: v["error"].as_str().map_or_else(|| format!("HTTP {}", status.as_u16()), String::from),
                code: v["code"].as_str().map(String::from),
            });
        }
        // Empty body (204 etc.) decodes as `null`.
        serde_json::from_str(if text.trim().is_empty() { "null" } else { &text }).map_err(Error::Decode)
    }

    fn get<T: DeserializeOwned>(&self, path: &str, q: &[(&str, &str)]) -> Result<T> {
        self.call(Method::GET, path, q, None)
    }
    fn post<T: DeserializeOwned>(&self, path: &str, b: Option<Value>) -> Result<T> {
        self.call(Method::POST, path, &[], b)
    }
    fn patch<T: DeserializeOwned>(&self, path: &str, q: &[(&str, &str)], b: Option<Value>) -> Result<T> {
        self.call(Method::PATCH, path, q, b)
    }
    fn delete(&self, path: &str) -> Result<()> {
        self.call::<IgnoredAny>(Method::DELETE, path, &[], None).map(|_| ())
    }

    // Accounts
    pub fn fetch_default_account(&self) -> Result<AccountResponse> {
        self.get("/api/accounts/default", &[])
    }
    pub fn fetch_accounts(&self) -> Result<Vec<AccountResponse>> {
        self.get("/api/accounts", &[])
    }
    pub fn create_account(&self, d: &CreateAccountRequest) -> Result<AccountResponse> {
        self.post("/api/accounts", body(d))
    }
    pub fn update_account(&self, id: &str, d: &UpdateAccountRequest) -> Result<AccountResponse> {
        self.patch(&format!("/api/accounts/{id}"), &[], body(d))
    }
    pub fn delete_account(&self, id: &str) -> Result<()> {
        self.delete(&format!("/api/accounts/{id}"))
    }
    pub fn set_default_account(&self, id: &str) -> Result<()> {
        self.post::<IgnoredAny>(&format!("/api/accounts/{id}/set-default"), body(&serde_json::json!({}))).map(|_| ())
    }

    // Transactions
    pub fn fetch_transactions(&self, account_id: &str) -> Result<Vec<TransactionResponse>> {
        self.get("/api/transactions", &[("account_id", account_id)])
    }
    pub fn create_transaction(&self, d: &CreateTransactionRequest) -> Result<TransactionResponse> {
        self.post("/api/transactions", body(d))
    }
    pub fn update_transaction(&self, id: &str, d: &UpdateTransactionRequest) -> Result<TransactionResponse> {
        self.patch(&format!("/api/transactions/{id}"), &[], body(d))
    }
    pub fn delete_transaction(&self, id: &str) -> Result<()> {
        self.delete(&format!("/api/transactions/{id}"))
    }
    pub fn confirm_transaction(&self, id: &str) -> Result<TransactionResponse> {
        self.post(&format!("/api/transactions/{id}/confirm"), None)
    }
    pub fn confirm_installment_transaction(&self, id: &str) -> Result<TransactionResponse> {
        self.post(&format!("/api/transactions/{id}/confirm-installment"), None)
    }

    // Goals
    pub fn list_goals(&self, account_id: &str) -> Result<Vec<GoalResponse>> {
        self.get("/api/goals", &[("account_id", account_id)])
    }
    pub fn fetch_goals_tracking(&self, account_id: &str) -> Result<GoalsTrackingResponse> {
        self.get("/api/goals/tracking", &[("account_id", account_id)])
    }
    pub fn create_goal(&self, d: &CreateGoalRequest) -> Result<GoalResponse> {
        self.post("/api/goals", body(d))
    }
    pub fn update_goal(&self, id: &str, d: &UpdateGoalRequest) -> Result<()> {
        self.patch::<IgnoredAny>(&format!("/api/goals/{id}"), &[], body(d)).map(|_| ())
    }
    pub fn list_goal_ledger(&self, goal_id: &str) -> Result<Vec<GoalLedgerEntryResponse>> {
        self.get(&format!("/api/goals/{goal_id}/ledger"), &[])
    }
    pub fn add_goal_ledger_entry(&self, goal_id: &str, d: &AddGoalLedgerRequest) -> Result<GoalLedgerEntryResponse> {
        self.post(&format!("/api/goals/{goal_id}/ledger"), body(d))
    }
    pub fn reverse_goal_ledger_entry(&self, goal_id: &str, entry_id: &str) -> Result<GoalLedgerEntryResponse> {
        self.post(&format!("/api/goals/{goal_id}/ledger/{entry_id}/reverse"), body(&serde_json::json!({})))
    }
    pub fn list_goal_recurring(&self, account_id: &str) -> Result<Vec<GoalRecurringDueItemResponse>> {
        self.get("/api/goals/recurring", &[("account_id", account_id)])
    }
    pub fn confirm_goal_recurring(&self, id: &str) -> Result<()> {
        self.post::<IgnoredAny>(&format!("/api/goals/recurring/{id}/confirm"), None).map(|_| ())
    }

    // Check
    pub fn post_check(&self, amount: f64, account_id: Option<&str>) -> Result<CheckResponse> {
        self.post("/api/check", body(&CheckRequest { amount, account_id: account_id.map(String::from) }))
    }

    // Pay schedules
    pub fn list_pay_schedules(&self, account_id: &str) -> Result<Vec<PayScheduleResponse>> {
        self.get("/api/pay-schedule", &[("account_id", account_id)])
    }
    pub fn create_pay_schedule(&self, d: &CreatePayScheduleRequest) -> Result<PayScheduleResponse> {
        self.post("/api/pay-schedule", body(d))
    }
    pub fn update_pay_schedule(&self, id: &str, d: &UpdatePayScheduleRequest) -> Result<()> {
        self.patch::<IgnoredAny>(&format!("/api/pay-schedule/{id}"), &[], body(d)).map(|_| ())
    }
    pub fn delete_pay_schedule(&self, id: &str) -> Result<()> {
        self.delete(&format!("/api/pay-schedule/{id}"))
    }
    pub fn confirm_pay_schedule(&self, id: &str) -> Result<PayScheduleResponse> {
        self.post(&format!("/api/pay-schedule/{id}/confirm"), None)
    }

    // Friends
    pub fn list_friends(&self) -> Result<Vec<FriendResponse>> {
        self.get("/api/friends", &[])
    }
    pub fn create_friend(&self, d: &CreateFriendRequest) -> Result<FriendResponse> {
        self.post("/api/friends", body(d))
    }
    pub fn update_friend(&self, id: &str, d: &PatchFriendRequest) -> Result<()> {
        self.patch::<IgnoredAny>(&format!("/api/friends/{id}"), &[], body(d)).map(|_| ())
    }
    pub fn delete_friend(&self, id: &str) -> Result<()> {
        self.delete(&format!("/api/friends/{id}"))
    }
    pub fn fetch_friend_summary(&self, account_id: &str) -> Result<FriendSummaryResponse> {
        self.get("/api/friends/summary", &[("account_id", account_id)])
    }
    pub fn fetch_friend_breakdown(&self, account_id: &str) -> Result<Vec<FriendDebtBreakdownItem>> {
        self.get("/api/friends/breakdown", &[("account_id", account_id)])
    }

    // Peer debts
    pub fn list_peer_debts(&self, account_id: &str, friend_id: Option<&str>) -> Result<Vec<PeerDebtResponse>> {
        let mut q = vec![("account_id", account_id)];
        q.extend(friend_id.map(|f| ("friend_id", f)));
        self.get("/api/peer-debts", &q)
    }
    pub fn create_peer_debt(&self, d: &CreatePeerDebtRequest) -> Result<PeerDebtResponse> {
        self.post("/api/peer-debts", body(d))
    }
    pub fn update_peer_debt(&self, id: &str, d: &PatchPeerDebtRequest) -> Result<()> {
        self.patch::<IgnoredAny>(&format!("/api/peer-debts/{id}"), &[], body(d)).map(|_| ())
    }
    pub fn delete_peer_debt(&self, id: &str) -> Result<()> {
        self.delete(&format!("/api/peer-debts/{id}"))
    }
    pub fn confirm_debt(&self, id: &str) -> Result<()> {
        self.post::<IgnoredAny>(&format!("/api/peer-debts/{id}/confirm"), body(&serde_json::json!({}))).map(|_| ())
    }
    pub fn toggle_debt_confirm(&self, id: &str) -> Result<()> {
        self.post::<IgnoredAny>(&format!("/api/peer-debts/{id}/confirm-toggle"), body(&serde_json::json!({}))).map(|_| ())
    }

    // Group events
    pub fn list_group_events(&self, account_id: &str) -> Result<Vec<GroupEventResponse>> {
        self.get("/api/group-events", &[("account_id", account_id)])
    }
    pub fn create_group_event(&self, d: &CreateGroupEventRequest) -> Result<GroupEventResponse> {
        self.post("/api/group-events", body(d))
    }
    pub fn get_group_event(&self, id: &str) -> Result<GroupEventResponse> {
        self.get(&format!("/api/group-events/{id}"), &[])
    }
    pub fn update_group_event(&self, id: &str, d: &PatchGroupEventRequest) -> Result<()> {
        self.patch::<IgnoredAny>(&format!("/api/group-events/{id}"), &[], body(d)).map(|_| ())
    }
    pub fn delete_group_event(&self, id: &str) -> Result<()> {
        self.delete(&format!("/api/group-events/{id}"))
    }
    pub fn set_participants(&self, event_id: &str, d: &SetParticipantsRequest) -> Result<()> {
        self.call::<IgnoredAny>(Method::PUT, &format!("/api/group-events/{event_id}/participants"), &[], body(d)).map(|_| ())
    }
    pub fn add_group_event_transaction(&self, event_id: &str, d: &AddTransactionRequest) -> Result<GroupEventTransactionResponse> {
        self.post(&format!("/api/group-events/{event_id}/transactions"), body(d))
    }
    pub fn remove_group_event_transaction(&self, event_id: &str, transaction_id: &str) -> Result<()> {
        self.delete(&format!("/api/group-events/{event_id}/transactions/{transaction_id}"))
    }
    pub fn list_group_event_transactions(&self, event_id: &str) -> Result<Vec<GroupEventTransactionResponse>> {
        self.get(&format!("/api/group-events/{event_id}/transactions"), &[])
    }

    // Config, profile, ledger
    pub fn fetch_public_config(&self) -> Result<PublicConfigResponse> {
        self.get("/api/config", &[])
    }
    pub fn fetch_profile(&self, account_id: &str) -> Result<ProfileResponse> {
        self.get("/api/profile", &[("account_id", account_id)])
    }
    pub fn update_profile(&self, account_id: &str, d: &UpdateProfileRequest) -> Result<()> {
        self.patch::<IgnoredAny>("/api/profile", &[("account_id", account_id)], body(d)).map(|_| ())
    }
    pub fn fetch_ledger(&self, account_id: &str) -> Result<Vec<LedgerEntryResponse>> {
        self.get("/api/ledger", &[("account_id", account_id)])
    }
    pub fn delete_ledger_entry(&self, id: &str) -> Result<()> {
        self.delete(&format!("/api/ledger/{id}"))
    }
    pub fn record_income(&self, d: &RecordIncomeRequest) -> Result<()> {
        self.post::<IgnoredAny>("/api/ledger/income", body(d)).map(|_| ())
    }
}
