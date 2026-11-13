# cibi desktop

The cibi desktop app: a Tauri 2 window for a payday plan. It shows what is left to spend in each pay
period, and every payment can be undone.

## Run

From `desktop/`:

```sh
npm install
npm run tauri dev
```

Build the packaged app. From the repo root, `make upd` runs the same command:

```sh
npm run tauri build
```

## Check

```sh
npm run lint
npm run build
npm test
```

From `desktop/src-tauri`:

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

On Windows, put the MSVC toolchain on the PATH first: `export PATH="$USERPROFILE/.cargo/bin:$PATH"`.

## The app

Four screens:

- **Plano** — the payday plan. A banner confirms a payday that arrived (today or overdue). The summary
  shows the balance and the money free until the end of the current period. The "Quanto posso gastar?"
  simulator checks a purchase against every future period. The period cards list the bills due in each
  period, with **Pagar** and **Desfazer** inline. The last section lists every bill so it can be edited.
- **Extrato** — every ledger entry: income, payment, manual adjustment and reversal. The original stays
  visible after it is undone. Each undoable entry has **Desfazer**.
- **Amigos** — who owes whom. A debt the user owes enters the plan; a debt owed to the user stays as a
  reminder. Paying or receiving goes through the ledger, so the balance follows.
- **Ajustes** — accounts, pay schedules, the explicit theme choice, and start at login.

The plan is computed in `src/lib/forecast.ts` from the rows the API already returns. A period starts on
a payday and ends on the next one. Income from a payday that is due but not confirmed is left out of
the free amount: the banner asks for confirmation first, so the app never offers money that is not in
the account.

### Undo

Confirming a bill writes a ledger entry and advances the bill (or the installment count). **Desfazer**
adds a reversal with the opposite amount, marks the original as reversed, restores the bill's date, the
installment count or the one-off pending state, and recomputes the balance. The original and the
reversal both stay in the statement. The same works for a confirmed payday, an as-needed purchase and a
friend debt.

The migration `0013_ledger_audit.sql` adds `occurrence_date`, `reverses_entry_id` and `reversed_by_id`
to `ledger`, plus indexes on the two foreign keys.

## Design check

The design smoke check uses Playwright against the running app. It checks for horizontal overflow at
1100×800 and 820×700 on the four screens and writes screenshots to `docs/design/validation`.

1. Start the app with remote debugging on WebView2:

   ```powershell
   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
   npm run tauri dev
   ```

2. In another terminal, from `desktop/`:

   ```sh
   npm run design:check
   ```

`npm run seed:design` fills a throwaway database with a realistic plan. Set `CIBI_DB_PATH` to a temp
file first:

```powershell
$env:CIBI_DB_PATH = "$env:TEMP\cibi-design.db"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
npm run tauri dev
npm run seed:design
```

The seed script refuses to touch a database that already has an account.

## Data

- The database is `cibi.db` in the app data directory: `%APPDATA%\com.ufleck.cibi\cibi.db`.
- Set `CIBI_DB_PATH` to open another file.
- A database created by the former Go server is adopted in place. Its schema is checked, then `PRAGMA user_version` is set to 1. Nothing else changes.
- Migrations live in `src/domain/migrations`.

## Layout

- `src-tauri/`: the Rust shell. It creates the window and tray icon, enforces a single instance, handles start at login, and owns the SQLite connection behind the `db_query` command.
- `src/`: the React UI. Pages are in `src/pages`, components in `src/components`.
- `src/domain/`: the domain logic (services, repos and route handlers), running inside the app.
- `src/lib/api.ts`: the client the UI uses to call the domain.
- `src/lib/forecast.ts`: the payday forecast and the purchase simulator.

Start at login launches the app with `--hidden`. In that case the window is created hidden.

## Look

- The Ink theme lives in `src/index.css`; dark is the default. The theme button in the top bar switches
  it; the choice is saved in `localStorage` under `cibi.theme`.
- Inter (text) and JetBrains Mono (numbers) are bundled with `@fontsource-variable`, so the app works
  offline. Numbers use the `num` class (mono, tabular figures).
- The top bar is the title bar: it holds the four tabs, the account selector, the theme button and the
  window controls. At 640 px and wider the right side keeps 148 px clear for the controls.

## Backups

The app backs up the database by itself:

- Every 5 minutes it checkpoints the WAL, so `cibi.db` holds all committed data.
- It writes `backups\cibi-latest.sql`, a deterministic SQL dump. The file is rewritten only when the data changes, so git history stays small and readable.
- It writes binary snapshots `backups\cibi-YYYYMMDD-HHMMSS.db`. It keeps 14 daily and 8 weekly snapshots. A snapshot is taken at startup, every 24 hours, and on quit.

Files live in `%APPDATA%\com.ufleck.cibi\backups`. Set `CIBI_BACKUP_DIR` to use another folder.

`scripts\backup-push.ps1` commits `cibi-latest.sql` to a git repo in the backups folder and pushes it. The `.gitignore` it needs (`scripts\backups-gitignore`) keeps the `.db` snapshots out of git.

> **The backups repo MUST stay private.** `cibi-latest.sql` is your financial data in plain text. Do not make the repo public, and do not share it.
>
> Do not copy `cibi.db` alone. Its recent writes may still be in `cibi.db-wal`, so a lone copy can lose data. Use the `.sql` dump or a `.db` snapshot, or copy all three files while the app is closed.

### One-time setup

Run these yourself. They are not run by the scripts:

```powershell
gh repo create uFleck/cibi-backups --private
git -C "$env:APPDATA\com.ufleck.cibi\backups" init -b main
Copy-Item C:\Projects\cibi\scripts\backups-gitignore "$env:APPDATA\com.ufleck.cibi\backups\.gitignore"
git -C "$env:APPDATA\com.ufleck.cibi\backups" remote add origin https://github.com/uFleck/cibi-backups.git
```

The first run of `backup-push.ps1` prints these commands and exits if the folder is not a git repo yet.

### Push on a schedule

Run `scripts\backup-push.ps1` once a day. If the push fails (offline, or no auth), the commit stays local and is pushed on the next run.

Register a daily task with Task Scheduler. Run this in an elevated or normal PowerShell, as you prefer:

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Projects\cibi\scripts\backup-push.ps1"'
$trigger = New-ScheduledTaskTrigger -Daily -At 22:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName 'cibi backup push' -Action $action -Trigger $trigger -Settings $settings
```

With `-StartWhenAvailable`, a run missed because the PC was off at 22:00 runs when the PC is next on.

The same task with `schtasks`:

```cmd
schtasks /Create /TN "cibi backup push" /SC DAILY /ST 22:00 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Projects\cibi\scripts\backup-push.ps1"
```

### Restore

1. Quit cibi from the system tray. The restore script refuses to run while cibi is open.
2. Run the restore script with a `.sql` dump or a `.db` snapshot:

   ```powershell
   C:\Projects\cibi\scripts\restore-backup.ps1 -File "$env:APPDATA\com.ufleck.cibi\backups\cibi-latest.sql"
   ```

   The script uses the release build in `desktop\src-tauri\target\release`. To use another build, add `-Exe <path to cibi.exe>`.
3. An existing database is moved aside, not deleted. It is renamed to `cibi.db.before-restore-<timestamp>`, along with its `-wal` and `-shm` files. Delete those files yourself once you are sure the restore is right.
4. Start cibi again.
