# cibi desktop

The cibi desktop app: a Tauri 2 window for the "Can I buy it?" engine and for your transactions, accounts, friends, and goals.

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

## Data

- The database is `cibi.db` in the app data directory: `%APPDATA%\com.ufleck.cibi\cibi.db`.
- Set `CIBI_DB_PATH` to open another file.
- A database created by the former Go server is adopted in place. Its schema is checked, then `PRAGMA user_version` is set to 1. Nothing else changes.
- Migrations live in `src/domain/migrations`.

## Layout

- `src-tauri/`: the Rust shell. It creates the window and tray icon, enforces a single instance, handles start at login, and owns the SQLite connection behind the `db_query` command.
- `src/`: the React UI. Pages are in `src/pages` and components in `src/components`.
- `src/domain/`: the domain logic (services, repos, and route handlers), running inside the app.
- `src/lib/api.ts`: the client the UI uses to call the domain.

Start at login launches the app with `--hidden`. In that case the window is created hidden.
