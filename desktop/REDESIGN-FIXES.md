# CIBI Desktop - redesign fixes (post-review round 2)

Status: DRAFT, waiting for approval (cibi/CLAUDE.md: no code before the plan is approved).
Source: user feedback 2026-10-10 + friends screenshots. Verify every item with `python desktop/scripts/shot.py <Page>` and read the PNG.

Goal: not 1:1 with the web app, but keep its charts and visual language (semantic colours, cards, sheets/offcanvas, accordions).

## Findings (verified in code)

- Only Transactions uses a real offcanvas: `window.open_sheet(cx, ...)` at `views/transactions.rs:183` and `:281`.
  Accounts (`accounts.rs:354`, `self.form.is_some()` renders inline), Goals (`goals.rs` `Mode::*` renders an inline form), Friends (inline inputs) do not.
- The web dashboard (`web/src/router.tsx`) has: StatCards, PayWindowBar, GoalsSnapshot, CheckWidget, **LedgerRecentWidget**, FriendLedger, ObligationsList, **ProjectionWidget (recharts BarChart + ReferenceLine)**.
  Desktop dashboard has no chart (`dashboard.rs:336` is a plain row list) and no Recent-activity card.
- Web colours amounts by sign (`text-green-600` / `text-red-500`, `LedgerRecentWidget.tsx:36`). Desktop uses plain text in most places (dashboard rows, ledger, friends rows).
- gpui-component 0.7.1 (via gpui-kit) ships `chart/{bar,line,area,pie}_chart.rs`, `accordion.rs`, `collapsible.rs`, `sheet.rs`, `setting/`. No new dependency needed. No smooth-scroll feature found: a grep for "smooth|inertia" across gpui-component hits only shimmer/sidebar/speech, nothing in `scroll/` (see spike S1; GPUI core itself is not yet checked). `Sheet` builder supports `title`, `footer`, `size`, `resizable`, `overlay`, `overlay_closable`, `on_close` (`sheet.rs`), enough for item 1.

## Shared groundwork (do first, everything else depends on it)

G1. `views/ui.rs` (new, small): 
  - `amount_color(cx, f64) -> Hsla` (success / danger / muted for 0), used everywhere an amount is shown.
  - `open_form_sheet(window, cx, title, content)` wrapping `window.open_sheet` the way transactions already does, plus close-on-save helper (`window.close_sheet(cx)`; confirm exact API in gpui-component `sheet.rs`/`window_ext.rs`).
  - Move `card()`/`row()` from `dashboard.rs` here so all pages share one card style.
G2. Rule for forms: a form is an `Entity<...Form>` created once, `load()`ed on open, shown in a sheet; the page never renders it inline (copy the `transactions/form.rs` pattern).

## Work items

### 1. Offcanvases everywhere (Accounts, Goals, Friends)
- Accounts: "New account" / "Edit" / "Schedules" open a sheet (title "Edit account", etc.) instead of replacing the page (`accounts.rs` `self.form` / `self.sform`). Extract the form body into `views/accounts/form.rs`.
- Goals: New goal, Edit, Add money, Remove money each open a sheet; the History/Ledger view opens a sheet too. Remove the inline `Mode::*` rendering; keep Mode only to know what the sheet is doing.
- Friends: Add friend, Edit friend, Add debt, Create event, PIX QR amount each open a sheet (see item 6).
- Accept: no page content shifts when an action is clicked; sheet closes after a successful save; errors show inside the sheet.

### 2. Dashboard colour + chart parity
- Colour: Reserved = warning, Liquid = success/danger (already), Payday progress bar gold, goal progress gold, Friend ledger "They owe me" success / "I owe" danger / Net by sign, obligations amounts danger, "Check" verdict YES/WAIT/NO already coloured - keep. Card titles muted caps, values foreground.
- Add chart: port `ProjectionWidget.tsx` (BarChart of Income / Recurring / Installments / Peer debts / Net / Projected end balance with per-bar colour and zero ReferenceLine) using gpui-component `BarChart` (read `chart/bar_chart.rs` and `plot/` for the API first). Keep the numeric rows under it (collapsible) - the chart is the primary view.
- Add "Recent activity" card (last 5 ledger entries, sign-coloured, "View all" -> Transactions > Recent activity), port of `LedgerRecentWidget.tsx`.
- Check the other web widgets (GoalsSnapshot, FriendLedger, Obligations) against desktop for missing pieces; list gaps in PLAN.md rather than guessing.
- Accept: screenshot shows coloured amounts, a bar chart with coloured bars, and the Recent activity card.

### 3. Recent activity colour (Transactions > Recent activity)
- Amount colour via `amount_color`; entry type as a small tag (gpui-component `tag.rs`/`badge.rs`) with humanised text; date muted. Same row component reused by the dashboard card (item 2) and Settings ledger (item 7).

### 4. Accounts edit -> sheet
- Covered by item 1 (Accounts bullet); listed separately because it was reported separately. Also colour balance by sign and mark the default account with a gold badge.

### 5. Goals actions -> sheet
- Covered by item 1 (Goals bullet). Also colour progress bar gold, "Remaining" muted, completed goals success.

### 6. Friends page rebuild (screenshots: everything stacked on one page, unstyled)
Layout, web-style master/detail:
- Left/top: summary cards (Owed to you, You owe, Net, Next payment) with colours + Linck installment card.
- Friend list as rows/cards (name, net balance coloured, Open / Copy link as icon-or-small buttons). Selecting a friend shows detail in the main area, not appended below.
- Detail: header (name, PIX key, Edit button -> sheet), debts table (date, description, amount coloured, status tag, Confirm/Unconfirm/Delete), "Add debt" button -> sheet.
- PIX QR: card with fixed-size QR (~180px, currently stretched to full width - bug in `friends.rs`), amount input beside it, copy-key button.
- Group events: collapsed accordion section with "New event" button -> sheet.
- Accept: no raw input rows on the page; QR is square; nothing renders below the fold that belongs to a different concern.

### 7. Settings restructure
- Profile starts as an Overview card (display name, PIX key, account, default flag, current API URL) with an "Edit profile" button -> sheet containing the inputs + Save.
- Appearance section: light/dark switch lives here (move out of the sidebar footer; keep `set_dark`).
- Tray / start-at-login switches stay (Background section).
- "Record income" and "Ledger" move into closed accordions (gpui-component `accordion.rs`), default collapsed; Record income form inside its accordion, Ledger uses the shared row from item 3.
- API base URL + Public base URL grouped under a "Connection" card.
- Accept: first screen of Settings fits without scrolling and shows no input except the dark-mode switch and toggles.

### 8. Light/dark toggle -> Settings
- Remove the sidebar footer button (`shell.rs` footer), add the switch in Settings > Appearance (item 7). Footer keeps only the loading indicator.

### 9. Smooth scrolling
- Spike S1 first (30 min cap): check whether gpui 0.3.x / gpui-component `scroll/scrollable.rs` exposes scroll easing or a pixel-delta setting. Options if not native: (a) accept GPUI's default wheel handling and tune line height / delta per notch, (b) wrap scroll containers in a small `ScrollHandle` animator that lerps offset toward a target each frame (~40 lines, in `ui.rs`), used by every `overflow_y_scroll` page.
- Accept: wheel scroll glides (no per-notch jumps) on Dashboard, Transactions, Friends, Settings; verified by screen recording or two screenshots mid-scroll (shot.py would need a `--scroll` option; add only if (b) is chosen).

## Suggested order / delegation
1. G1+G2 (ui.rs, sheet helper) - one agent, blocks the rest.
2. In parallel (separate worktrees, per CLAUDE.md): [Accounts+Goals sheets], [Dashboard chart + colours + Recent activity], [Friends rebuild], [Settings + dark toggle].
3. Smooth scrolling spike, then implement.
4. Screenshot every page, compare against the web app (run web at the Docker URL), fix leftovers.

## Verification
- `cargo build -p cibi-desktop` + `cargo test -p cibi-client` green.
- `python desktop/scripts/shot.py` for all pages; for sheets add a `CIBI_OPEN=<action>` env (same idea as `CIBI_START_VIEW`) so the script can screenshot an open sheet. Add only if clicking is not practical.
- `make upd` after shipping (CLAUDE.md), even though only desktop code changes.

## Open questions (need answers before coding)
1. Chart scope: just the Monthly projection bar chart (what the web has), or also add trend charts (balance over time, spending by category) the web does not have?
2. Friends: master/detail in-page (recommended) or one sheet per friend that holds the whole detail?
3. Recent activity: dashboard card shows 5 entries like the web - OK?
4. Settings overview: which fields should it show beyond name / PIX key / account? (web settings page is the reference unless you say otherwise)
5. Smooth scroll: OK to ship a custom animator (b) if GPUI has nothing native, or prefer to skip if it costs more than ~40 lines?
6. Delegate with worktrees + Haiku subagents as in earlier phases, or implement serially in this session?
