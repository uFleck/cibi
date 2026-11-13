mod backup;
mod db;
mod shell;

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, RunEvent};

const CHECKPOINT_EVERY: Duration = Duration::from_secs(5 * 60);
const BACKUP_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

fn report(result: Result<(), String>) {
    if let Err(e) = result {
        eprintln!("backup: {e}");
    }
}

fn backup_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    match std::env::var("CIBI_BACKUP_DIR") {
        Ok(p) if !p.is_empty() => Ok(PathBuf::from(p)),
        _ => Ok(app.path().app_data_dir()?.join("backups")),
    }
}

/// Checkpoints every 5 minutes and runs a full backup at startup and then every 24 hours.
fn start_backups(app: AppHandle, dir: PathBuf) {
    std::thread::spawn(move || {
        let mut next_backup = Instant::now();
        loop {
            let db = app.state::<db::Db>();
            if let Ok(conn) = db.0.try_lock() {
                if Instant::now() >= next_backup {
                    next_backup = Instant::now() + BACKUP_EVERY;
                    let (stamp, now) = backup::now_stamp();
                    report(backup::run_backup(&conn, &dir, &stamp, now));
                } else {
                    report(db::checkpoint(&conn));
                }
            }
            std::thread::sleep(CHECKPOINT_EVERY);
        }
    });
}

fn backup_on_exit(app: &AppHandle) {
    let Ok(dir) = backup_dir(app) else { return };
    let db = app.state::<db::Db>();
    let Ok(conn) = db.0.lock() else { return };
    let (stamp, now) = backup::now_stamp();
    report(backup::run_backup(&conn, &dir, &stamp, now));
}

/// Returns the path after `--restore`; an error when the flag has no path.
fn restore_arg(args: &[String]) -> Option<Result<&str, String>> {
    let i = args.iter().position(|a| a == "--restore")?;
    Some(
        args.get(i + 1)
            .map(String::as_str)
            .ok_or_else(|| "--restore needs a file path".to_string()),
    )
}

fn restore_db_path() -> Result<PathBuf, String> {
    match std::env::var("CIBI_DB_PATH") {
        Ok(p) if !p.is_empty() => Ok(PathBuf::from(p)),
        _ => std::env::var("APPDATA")
            .map(|d| PathBuf::from(d).join("com.ufleck.cibi").join("cibi.db"))
            .map_err(|e| format!("APPDATA is not set: {e}")),
    }
}

fn append_restore_log(db: &Path, line: &str) {
    let Some(dir) = db.parent() else { return };
    let _ = fs::create_dir_all(dir);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("restore.log"))
    {
        let _ = writeln!(f, "{} {line}", backup::now_stamp().0);
    }
}

fn restore_cli(src: &Path) -> i32 {
    let db = match restore_db_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let result = backup::restore_file(src, &db);
    let line = match &result {
        Ok(()) => format!("restored {} into {}", src.display(), db.display()),
        Err(e) => format!("restore of {} failed: {e}", src.display()),
    };
    eprintln!("{line}");
    append_restore_log(&db, &line);
    i32::from(result.is_err())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    match restore_arg(&args) {
        None => {}
        Some(Ok(src)) => std::process::exit(restore_cli(Path::new(src))),
        Some(Err(e)) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_main(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let path = match std::env::var("CIBI_DB_PATH") {
                Ok(p) if !p.is_empty() => PathBuf::from(p),
                _ => {
                    let dir = app.path().app_data_dir()?;
                    std::fs::create_dir_all(&dir)?;
                    dir.join("cibi.db")
                }
            };
            let conn = db::open(&path)?;
            app.manage(db::Db(Mutex::new(conn)));
            start_backups(app.handle().clone(), backup_dir(app.handle())?);
            shell::setup_tray(app)?;
            shell::show_on_launch(app);
            Ok(())
        })
        .on_window_event(shell::on_window_event)
        .invoke_handler(tauri::generate_handler![db::db_query])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                backup_on_exit(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::restore_arg;

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_restore_flag() {
        assert_eq!(
            restore_arg(&args(&["cibi", "--restore", "a.sql"])),
            Some(Ok("a.sql"))
        );
        assert_eq!(restore_arg(&args(&["cibi", "--hidden"])), None);
        assert!(matches!(
            restore_arg(&args(&["cibi", "--restore"])),
            Some(Err(_))
        ));
    }
}
