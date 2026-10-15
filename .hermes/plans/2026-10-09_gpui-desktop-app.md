# CIBI desktop app (GPUI, Windows-first)

## Goal
Native Windows app, feature parity with the React UI (web/src), talking to the existing Go API (cmd/cibi-api). No API changes.

## Findings
- API: Echo, JSON, NO auth (no middleware), groups under /api: accounts, transactions, goals, pay-schedule, friends, peer-debts, group-events, ledger, profile, check, config. /public/* = tokenized friend/group pages (served to friends in a browser; not desktop scope).
- UI pages (router.tsx): / dashboard, /accounts, /transactions, /friends, /goals, /settings, + public friend/group pages.
- Contract source: web/src/lib/api.ts (789 lines, ~60 calls) + internal/handler/docs/openapi.yaml.
- Logic done client-side in web/src/lib that must be ported to Rust (not API): financial-window, monthly-projection, transactions-impact, pay-schedule, pix-qrcode, format, locale (pt-BR dates/BRL).
- Toolchain: cargo/rustc 1.95 present. link.exe on PATH is git's, NOT MSVC -> need VS Build Tools (C++ + Windows SDK) for GPUI.
- crates.io: gpui 0.2.2, gpui-component 0.7.1 (60+ widgets: table, input, dialog, sheet, tabs, date picker, charts, theming). Use it instead of hand-built widgets.

## Approach
New dir `desktop/` in the cibi repo (Cargo workspace, 2 crates):
1. `cibi-client` – typed async HTTP client (reqwest+serde, rustls) mirroring api.ts; models = serde structs from openapi.yaml/api.ts types. Plus ported pure logic (projection, window, impact, pay-schedule, pix payload) with unit tests copied from web/src/__tests__ cases.
2. `cibi-desktop` – GPUI app: gpui + gpui-component, sidebar nav, one view per page, global AppState entity (selected account, cached data, refetch after mutations).
Money: API amounts are numbers (check fix_amount_scale migration for cents vs reais) -> keep integer in Rust, format pt-BR/BRL.
Server: app connects to base URL from settings file (default http://localhost:8080); no embedded server in v1. Optional later: spawn cibi-api.exe as sidecar.

## Phases
0. Setup: install VS Build Tools, `cargo new` workspace, pin gpui git/crates version, hello window + gpui-component theme (dark/light; account theme from account.theme field).
1. Client crate: models + all endpoints + tests against a running API (make upd / go run cmd/cibi-api).
2. Shell: sidebar, account selector, error/toast, loading states.
3. Accounts: list/create/edit/delete/set-default, pay-schedule forms, theme, safety buffer.
4. Transactions (largest, 1125 lines): list+filters, create/edit/delete, confirm, installments + confirm-installment, impact preview, custom projection sheet, ledger recent.
5. Dashboard: stat cards, check widget (POST /check verdict), projection, payday, pay-window bar, goals snapshot, friend ledger widget, obligations.
6. Friends: friends, peer debts (confirm/toggle), group events (participants, txns), breakdown/summary, PIX QR, copy public link (clipboard).
7. Goals: CRUD, tracking, ledger add/reverse, recurring confirm.
8. Settings/profile (public_base_url, etc.), ledger income/delete.
9. Polish: keyboard shortcuts (useKeyboardShortcuts.ts), pt-BR, packaging (cargo-packager/WiX .msi or plain exe), CI build.

## Files
desktop/Cargo.toml, desktop/cibi-client/src/{lib,models,api,projection,window,impact,pay_schedule,pix}.rs, desktop/cibi-desktop/src/{main,state,shell}.rs + views/{dashboard,accounts,transactions,friends,goals,settings}.rs

## Verification
- cargo test (ported logic vs web test cases; client vs live API).
- Manual parity checklist: every function in api.ts exercised from some screen.
- Per CLAUDE.md: `make upd` after shipping.

## Risks
- GPUI is pre-1.0, API churn; pin versions. Windows backend (DirectX) is supported but less polished than macOS.
- Parity of transactions page is the bulk of the effort.
- No GPUI webview/QR widget: PIX QR rendered via `qrcode` crate to an image/paint.

## Decisions (confirmed)
- Components: `gpui-kit` 0.7.1 (one dep; re-exports gpui + gpui-component). Replaces the earlier gpui-component mention.
- Public friend/group pages: browser-only, not in app.
- Backend: Docker Desktop. Existing docker-compose.yml already runs cibi-api (port + sqlite volume, restart unless-stopped); app is a plain client at http://localhost:<port>. GPUI cannot run in a container (native window), so only the API is dockerized.
- Packaging: plain .exe.
- "Runs closed like a service": a GUI process cannot be a real Windows service (session 0 has no desktop). Do: tray icon, close button hides to tray, single-instance, optional start-at-login (HKCU Run key), tray menu Open/Quit. Optional: background poll of /api/transactions + goals/recurring for due-item toast notifications while hidden. Crates: tray-icon, single-instance.
- Locale: en-US only (drop pt-BR; BRL stays the currency unless you say otherwise - format as en-US number with R$ symbol).

## Phase changes
- Phase 0 adds: confirm `docker compose up -d` works in Docker Desktop and the API answers on localhost.
- Phase 9: tray/close-to-hide, single-instance, start-at-login, due-item notifications.

## Remaining question
- Currency: keep BRL (R$) with en-US formatting? (assumed yes)
