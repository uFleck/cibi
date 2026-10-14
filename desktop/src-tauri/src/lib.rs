mod db;
mod shell;

use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_main(app)
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_notification::init())
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
            app.manage(db::Db(std::sync::Mutex::new(conn)));
            shell::setup_tray(app)?;
            shell::hide_if_requested(app);
            Ok(())
        })
        .on_window_event(shell::on_window_event)
        .invoke_handler(tauri::generate_handler![db::db_query, db::db_tx])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
