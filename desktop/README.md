
## Run

1. API: from the repo root, `docker compose up` (serves http://localhost:42069).
2. Build: `cargo build --release -p cibi-desktop` (from `desktop/`) → `target\release\cibi-desktop.exe`.
3. Run the exe. API URL is editable in Settings.

## Tray behaviour

- Tray icon: left click or **Show** restores the window; **Quit** exits.
- Closing the window hides it to the tray (toggle in Settings → Background; off = close quits).
- Single instance: a second launch exits immediately.
- Settings → *Start at login* writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- While hidden, every 5 min the app checks for due items (unconfirmed transactions dated today or earlier, overdue goal contributions) and shows one Windows toast per new batch.
- Transactions page shortcuts (same as web): `n` new transaction, `f` focus search.
