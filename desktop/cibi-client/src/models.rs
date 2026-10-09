//! Wire types mirroring web/src/lib/api.ts. Money is f64 in major units (reais), never cents:
//! migration 20260414000001 divided stored amounts by 100 so the API speaks dollars/reais.
//! Exceptions: the Go handlers take int64 for ledger income and group-event transaction amounts (whole units only).
//! Enum-like fields stay strings (as in the TS types); dates stay as the API's strings.
use serde::{Deserialize, Serialize};

macro_rules! resp {
    ($($name:ident { $($f:ident: $t:ty),* $(,)? })*) => {$(
        #[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
        #[serde(default)]
        pub struct $name { $(pub $f: $t),* }
    )*};
}

// Request bodies: `{ required fields } opt { optional fields, omitted from JSON when None }`.
macro_rules! req {
    ($($name:ident { $($f:ident: $t:ty),* $(,)? } opt { $($of:ident: $ot:ty),* $(,)? })*) => {$(
        #[derive(Debug, Clone, Default, Serialize)]
        pub struct $name {
            $(pub $f: $t,)*
            $(#[serde(skip_serializing_if = "Option::is_none")] pub $of: Option<$ot>,)*
        }
    )*};
}

resp! {
    AccountResponse { id: String, name: String, current_balance: f64, currency: String, is_default: bool, safety_buffer: f64 }
    TransactionResponse {
        id: String, account_id: String,
        r#type: String,
        friend_id: Option<String>, amount: f64, description: String, category: Option<String>,
        timestamp: String, is_recurring: bool, requires_confirmation: bool, confirmed_at: Option<String>,
        frequency: Option<String>, anchor_date: Option<String>, next_occurrence: Option<String>,
        is_installment: bool, total_installments: Option<i64>, paid_installments: i64,
    }
    GoalResponse {
        id: String, account_id: String, name: String, status: String, target_amount: f64, invested_total: f64,
        min_contribution_per_window: Option<f64>, start_date_utc: String, target_date_utc: Option<String>,
        notes: Option<String>, currency: String,
    }
    GoalLedgerEntryResponse {
        id: String, goal_id: String, amount: f64, r#type: String, source: String, note: Option<String>,
        reverses_entry_id: Option<String>, timestamp_utc: String,
    }
    GoalsTrackingSummaryResponse { goals_count: i64, completed_count: i64, total_target: f64, total_invested: f64, total_remaining: f64 }
    GoalsTrackingGoalResponse {
        id: String, name: String, status: String, target_amount: f64, invested_total: f64, remaining_amount: f64,
        progress_pct: f64, min_contribution_per_window: Option<f64>, target_date_utc: Option<String>, created_at_utc: String,
    }
    GoalsTrackingActivityResponse {
        goal_id: String, goal_name: String, entry_id: String, amount: f64, r#type: String, source: String, timestamp_utc: String,
    }
    GoalsTrackingResponse {
        summary: GoalsTrackingSummaryResponse, top_goals: Vec<GoalsTrackingGoalResponse>,
        recent_activity: Vec<GoalsTrackingActivityResponse>, updated_at_utc: String,
    }
    CheckGoalImpactResponse {
        goal_id: String, goal_name: String, remaining_before: f64, remaining_after: f64, progress_before_pct: f64,
        progress_after_pct: f64, min_contribution_per_window: f64, severity: String,
    }
    GoalRecurringDueItemResponse {
        id: String, goal_id: String, goal_name: String, amount: f64, frequency: String, anchor_date_utc: String,
        next_due_utc: String, is_overdue: bool, last_entry_id: Option<String>, last_posted_at_utc: Option<String>,
    }
    CheckGoalWindowCoverageResponse { goal_id: String, goal_name: String, contributed_this_window: f64, min_contribution_per_window: f64 }
    CheckResponse {
        can_buy: bool, purchasing_power: f64, buffer_remaining: f64, risk_level: String, will_afford_after_payday: bool,
        wait_until: Option<String>, goal_impacts: Vec<CheckGoalImpactResponse>,
        goals_covered_this_window: Vec<CheckGoalWindowCoverageResponse>,
    }
    PayScheduleResponse {
        id: String, account_id: String, frequency: String, anchor_date: String, next_payday: String, amount: f64,
        day_of_month_2: Option<i64>, label: Option<String>,
    }
    FriendResponse { id: String, name: String, public_token: String, notes: Option<String>, pix_key: Option<String> }
    FriendSummaryResponse { total_owed_to_user: f64, total_user_owes: f64, net: f64, next_user_payment: f64 }
    FriendDebtBreakdownItem {
        friend_name: String, total_amount: f64, next_payment: f64, is_installment: bool, per_install_amount: f64,
        total_installments: i64, paid_installments: i64, next_payment_date: Option<String>,
    }
    PeerDebtResponse {
        id: String, account_id: String, friend_id: String, amount: f64, description: String, date: String,
        is_installment: bool, total_installments: Option<i64>, paid_installments: i64, frequency: Option<String>,
        anchor_date: Option<String>, is_confirmed: bool,
    }
    ParticipantResponse { friend_id: Option<String>, name: Option<String>, share_amount: f64, is_confirmed: bool }
    GroupEventResponse {
        id: String, account_id: String, title: String, date: String, total_amount: f64, public_token: String,
        notes: Option<String>, host_friend_id: Option<String>, participants: Option<Vec<ParticipantResponse>>,
    }
    GroupEventTransactionResponse { id: String, event_id: String, description: String, amount: i64, created_at: String }
    PublicConfigResponse { public_base_url: String }
    ProfileResponse { display_name: String, pix_key: Option<String>, theme: String }
    LedgerEntryResponse {
        id: String, account_id: String, transaction_id: Option<String>, pay_schedule_id: Option<String>,
        entry_type: String, amount: f64, description: String, posted_at: String,
    }
}

req! {
    CreateAccountRequest { name: String, current_balance: f64, currency: String } opt { safety_buffer: f64 }
    UpdateAccountRequest {} opt { name: String, current_balance: f64, currency: String, safety_buffer: f64 }
    CreateTransactionRequest { account_id: String, amount: f64, description: String }
        opt { is_recurring: bool, requires_confirmation: bool, frequency: String, anchor_date: String, is_installment: bool, total_installments: i64 }
    UpdateTransactionRequest {}
        opt { amount: f64, description: String, is_recurring: bool, requires_confirmation: bool, frequency: String, anchor_date: String, is_installment: bool, total_installments: i64 }
    CreateGoalRequest { account_id: String, name: String, target_amount: f64, start_date_utc: String }
        opt { min_contribution_per_window: f64, target_date_utc: String, notes: String }
    UpdateGoalRequest {} opt { name: String, target_amount: f64, target_date_utc: String, notes: String, min_contribution_per_window: f64 }
    AddGoalLedgerRequest { amount: f64, r#type: String } opt { source: String, note: String }
    CheckRequest { amount: f64 } opt { account_id: String }
    CreatePayScheduleRequest { account_id: String, frequency: String, anchor_date: String, amount: f64 } opt { day_of_month_2: i64, label: String }
    // The server treats PATCH as a full replace: frequency, anchor_date and amount are always required.
    UpdatePayScheduleRequest { frequency: String, anchor_date: String, amount: f64 } opt { day_of_month_2: i64, label: String }
    CreateFriendRequest { name: String } opt { notes: String, pix_key: String }
    PatchFriendRequest {} opt { name: String, notes: String, pix_key: String }
    CreatePeerDebtRequest { account_id: String, friend_id: String, amount: f64, description: String, date: String }
        opt { is_installment: bool, total_installments: i64, frequency: String }
    PatchPeerDebtRequest {}
        opt { amount: f64, description: String, date: String, is_installment: bool, total_installments: i64, frequency: String, is_confirmed: bool }
    // Server requires a non-zero total_amount although api.ts omits it.
    CreateGroupEventRequest { account_id: String, title: String, date: String, total_amount: f64 } opt { notes: String }
    PatchGroupEventRequest {} opt { title: String, date: String, total_amount: f64, notes: String }
    AddTransactionRequest { description: String, amount: i64 } opt {}
    ParticipantInput { friend_id: Option<String>, share_amount: f64 } opt { is_confirmed: bool }
    SetParticipantsRequest { participants: Vec<ParticipantInput> } opt { host_friend_id: String }
    UpdateProfileRequest { display_name: String, theme: String } opt { pix_key: String }
    RecordIncomeRequest { account_id: String, pay_schedule_id: String, amount: i64, description: String } opt {}
}
