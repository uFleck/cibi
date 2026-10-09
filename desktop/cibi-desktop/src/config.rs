//! Persisted settings: %APPDATA%\cibi-desktop\config.json
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct Config {
    pub base_url: String,
    pub dark: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self { base_url: "http://localhost:42069".into(), dark: true }
    }
}

fn path() -> PathBuf {
    let dir = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    dir.join("cibi-desktop").join("config.json")
}

impl Config {
    pub fn load() -> Self {
        std::fs::read_to_string(path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
    }

    pub fn save(&self) -> std::io::Result<()> {
        let p = path();
        std::fs::create_dir_all(p.parent().unwrap())?;
        std::fs::write(p, serde_json::to_string_pretty(self).unwrap())
    }
}
