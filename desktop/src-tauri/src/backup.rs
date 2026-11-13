use crate::db;
use rusqlite::{types::ValueRef, Connection, OpenFlags, Params, Row};
use std::{
    collections::BTreeMap,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const KEEP_DAYS: usize = 14;
const KEEP_WEEKS: i64 = 8;

/// Deterministic SQL text: schema (tables, rows, then indexes, triggers and views).
pub fn dump_sql(conn: &Connection) -> Result<String, String> {
    let mut out = String::from("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n");
    let tables = schema_objects(conn, "table")?;
    for (_, sql) in &tables {
        out.push_str(&format!("{sql};\n"));
    }
    for (name, _) in &tables {
        dump_rows(conn, name, &mut out)?;
    }
    for kind in ["index", "trigger", "view"] {
        for (_, sql) in schema_objects(conn, kind)? {
            out.push_str(&format!("{sql};\n"));
        }
    }
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    out.push_str(&format!("PRAGMA user_version={version};\n"));
    out.push_str("COMMIT;\n");
    Ok(out)
}

pub fn restore_sql(path: &Path, sql: &str) -> Result<(), String> {
    if path.exists() {
        return Err(format!("{} already exists", path.display()));
    }
    let result = Connection::open(path)
        .map_err(|e| e.to_string())
        .and_then(|conn| conn.execute_batch(sql).map_err(|e| e.to_string()));
    if result.is_err() {
        let _ = fs::remove_file(path);
    }
    result
}

/// Restores a `.sql` dump or copies a `.db` file into `db`, which must not exist yet.
pub fn restore_file(src: &Path, db: &Path) -> Result<(), String> {
    if db.exists() {
        return Err(format!("{} already exists", db.display()));
    }
    if let Some(dir) = db.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    match src.extension().and_then(|e| e.to_str()) {
        Some("sql") => {
            let sql = fs::read_to_string(src).map_err(|e| e.to_string())?;
            restore_sql(db, &sql)
        }
        Some("db") => {
            let wal = PathBuf::from(format!("{}-wal", src.display()));
            if fs::metadata(&wal).is_ok_and(|m| m.len() > 0) {
                return Err(format!(
                    "{} is not empty; checkpoint the source first",
                    wal.display()
                ));
            }
            fs::copy(src, db).map_err(|e| e.to_string())?;
            if !integrity_ok(db).is_ok_and(|ok| ok) {
                let _ = fs::remove_file(db);
                return Err("copied database failed integrity_check".to_string());
            }
            Ok(())
        }
        _ => Err("expected a .sql or .db file".to_string()),
    }
}

/// Writes `cibi-<stamp>.db` via VACUUM INTO and keeps it only if it passes integrity_check.
pub fn snapshot(conn: &Connection, dir: &Path, stamp: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("cibi-{stamp}.db"));
    let target = path.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{target}'"))
        .map_err(|e| e.to_string())?;
    let check = integrity_ok(&path).and_then(|ok| {
        if ok {
            Ok(())
        } else {
            Err("snapshot failed integrity_check".to_string())
        }
    });
    if let Err(e) = check {
        let _ = fs::remove_file(&path);
        return Err(e);
    }
    Ok(path)
}

/// Keeps the newest snapshot of the last 14 days with backups and of the last 8 weeks; deletes the rest.
pub fn prune(dir: &Path, now_unix: i64) -> Result<(), String> {
    let snaps = snapshots(dir)?;
    let now_week = now_unix.div_euclid(86_400).div_euclid(7);
    let mut newest_day = BTreeMap::new();
    let mut newest_week = BTreeMap::new();
    for (i, (_, day, _)) in snaps.iter().enumerate() {
        newest_day.insert(*day, i);
        let week = day.div_euclid(7);
        if (now_week - KEEP_WEEKS + 1..=now_week).contains(&week) {
            newest_week.insert(week, i);
        }
    }
    let mut keep = vec![false; snaps.len()];
    for &i in newest_day
        .values()
        .rev()
        .take(KEEP_DAYS)
        .chain(newest_week.values())
    {
        keep[i] = true;
    }
    for (i, (_, _, path)) in snaps.iter().enumerate() {
        if !keep[i] {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Checkpoints, refreshes `cibi-latest.sql` and a snapshot when data changed, then prunes.
pub fn run_backup(conn: &Connection, dir: &Path, stamp: &str, now_unix: i64) -> Result<(), String> {
    db::checkpoint(conn)?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let dump = dump_sql(conn)?;
    let latest = dir.join("cibi-latest.sql");
    let changed = fs::read_to_string(&latest).ok().as_deref() != Some(dump.as_str());
    if changed {
        let tmp = dir.join("cibi-latest.sql.tmp");
        fs::write(&tmp, &dump).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &latest).map_err(|e| e.to_string())?;
    }
    if changed || snapshots(dir)?.is_empty() {
        snapshot(conn, dir, stamp)?;
    }
    prune(dir, now_unix)
}

/// Returns the current UTC time as `YYYYMMDD-HHMMSS` and as unix seconds.
pub fn now_stamp() -> (String, i64) {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64);
    (format_stamp(secs), secs)
}

pub fn integrity_ok(path: &Path) -> Result<bool, String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    let first: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(first == "ok")
}

/// Snapshot files in `dir` as (stamp, day number, path), oldest first.
fn snapshots(dir: &Path) -> Result<Vec<(String, i64, PathBuf)>, String> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some((stamp, day)) = entry.file_name().to_str().and_then(parse_name) {
            out.push((stamp, day, entry.path()));
        }
    }
    out.sort();
    Ok(out)
}

fn parse_name(name: &str) -> Option<(String, i64)> {
    let stamp = name.strip_prefix("cibi-")?.strip_suffix(".db")?;
    let shape_ok = stamp.len() == 15
        && stamp.bytes().enumerate().all(|(i, b)| {
            if i == 8 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        });
    if !shape_ok {
        return None;
    }
    let part = |r: std::ops::Range<usize>| stamp[r].parse::<i64>().ok();
    let (y, m, d) = (part(0..4)?, part(4..6)?, part(6..8)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some((stamp.to_string(), days_from_civil(y, m, d)))
}

fn schema_objects(conn: &Connection, kind: &str) -> Result<Vec<(String, String)>, String> {
    query_all(
        conn,
        "SELECT name, sql FROM sqlite_master WHERE type = ?1 AND sql IS NOT NULL \
         AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name",
        [kind],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
}

fn dump_rows(conn: &Connection, table: &str, out: &mut String) -> Result<(), String> {
    let cols = query_all(
        conn,
        "SELECT name FROM pragma_table_xinfo(?1) WHERE hidden = 0",
        [table],
        |r| r.get::<_, String>(0),
    )?;
    if cols.is_empty() {
        return Ok(());
    }
    let without_rowid = query_all(
        conn,
        "SELECT wr FROM pragma_table_list WHERE schema = 'main' AND name = ?1",
        [table],
        |r| r.get::<_, bool>(0),
    )?
    .first()
    .copied()
    .unwrap_or(false);

    let n = cols.len();
    let list = cols.iter().map(|c| quote(c)).collect::<Vec<_>>().join(", ");
    let table = quote(table);
    let order = if without_rowid { "" } else { " ORDER BY rowid" };
    let mut stmt = conn
        .prepare(&format!("SELECT {list} FROM {table}{order}"))
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let vals = (0..n)
            .map(|i| {
                row.get_ref(i)
                    .map_err(|e| e.to_string())
                    .and_then(sql_literal)
            })
            .collect::<Result<Vec<_>, _>>()?;
        out.push_str(&format!(
            "INSERT INTO {table} ({list}) VALUES({});\n",
            vals.join(",")
        ));
    }
    Ok(())
}

fn sql_literal(v: ValueRef<'_>) -> Result<String, String> {
    Ok(match v {
        ValueRef::Null => "NULL".to_string(),
        ValueRef::Integer(i) => i.to_string(),
        ValueRef::Real(f) if f.is_nan() => "NULL".to_string(),
        ValueRef::Real(f) if f.is_infinite() => {
            if f > 0.0 { "9e999" } else { "-9e999" }.to_string()
        }
        ValueRef::Real(f) => format!("{f:?}"),
        ValueRef::Text(t) => match std::str::from_utf8(t) {
            Ok(s) if !s.contains('\0') => format!("'{}'", s.replace('\'', "''")),
            _ => format!("CAST(X'{}' AS TEXT)", hex(t)),
        },
        ValueRef::Blob(b) => format!("X'{}'", hex(b)),
    })
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

fn quote(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

fn query_all<T, P: Params>(
    conn: &Connection,
    sql: &str,
    params: P,
    f: impl FnMut(&Row<'_>) -> rusqlite::Result<T>,
) -> Result<Vec<T>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params, f).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<T>>>()
        .map_err(|e| e.to_string())
}

fn format_stamp(secs: i64) -> String {
    let (y, m, d) = civil_from_days(secs.div_euclid(86_400));
    let s = secs.rem_euclid(86_400);
    format!(
        "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
        s / 3600,
        s % 3600 / 60,
        s % 60
    )
}

/// Days since 1970-01-01 for a proleptic Gregorian date.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("cibi-{tag}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample(conn: &Connection) {
        conn.execute_batch(
            r#"CREATE TABLE "Acc" (id INTEGER PRIMARY KEY, name TEXT, bal REAL, cents INTEGER, note TEXT);
               CREATE INDEX acc_name ON "Acc"(name);
               CREATE VIEW v AS SELECT name FROM "Acc";
               CREATE TRIGGER trg AFTER INSERT ON "Acc" BEGIN SELECT 1; END;
               CREATE TABLE kv (k TEXT PRIMARY KEY, v BLOB) WITHOUT ROWID;
               INSERT INTO "Acc" (name, bal, cents, note) VALUES
                 ('O''Brien "x"', 0.1, -14990, NULL),
                 ('line
break', 1e100, 0, 'a;b'),
                 (NULL, -0.0, 9007199254740991, '');
               INSERT INTO kv VALUES ('b', X'00FF'), ('a', NULL);"#,
        )
        .unwrap();
    }

    fn count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM \"Acc\"", [], |r| r.get(0))
            .unwrap()
    }

    fn touch(dir: &Path, names: &[String]) {
        for n in names {
            fs::write(dir.join(n), b"").unwrap();
        }
    }

    fn remaining(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn snap_name(day: i64, time: &str) -> String {
        let (y, m, d) = civil_from_days(day);
        format!("cibi-{y:04}{m:02}{d:02}-{time}.db")
    }

    fn today() -> i64 {
        days_from_civil(2026, 10, 15)
    }

    #[test]
    fn checkpoint_truncates_wal() {
        let dir = temp_dir("ckpt");
        let wal = dir.join("t.db-wal");
        {
            let conn = db::open(&dir.join("t.db")).unwrap();
            conn.execute_batch("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1), (2);")
                .unwrap();
            assert!(fs::metadata(&wal).unwrap().len() > 0);
            db::checkpoint(&conn).unwrap();
            assert_eq!(fs::metadata(&wal).unwrap().len(), 0);
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn snapshot_has_same_rows_and_passes_integrity() {
        let dir = temp_dir("snap");
        let backups = dir.join("backups");
        let path = {
            let conn = db::open(&dir.join("src.db")).unwrap();
            sample(&conn);
            let path = snapshot(&conn, &backups, "20261015-090000").unwrap();
            let copy =
                Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
            assert_eq!(count(&copy), 3);
            assert_eq!(count(&copy), count(&conn));
            path
        };
        assert!(integrity_ok(&path).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dump_restore_round_trip_is_identical() {
        let src = Connection::open_in_memory().unwrap();
        sample(&src);
        src.execute_batch("PRAGMA user_version=7;").unwrap();
        let dump = dump_sql(&src).unwrap();
        assert!(dump.contains("X'00FF'"));

        let dir = temp_dir("restore");
        let path = dir.join("restored.db");
        restore_sql(&path, &dump).unwrap();
        assert!(restore_sql(&path, &dump).is_err());
        {
            let restored = Connection::open(&path).unwrap();
            assert_eq!(dump_sql(&restored).unwrap(), dump);
            assert_eq!(count(&restored), 3);
            let version: i64 = restored
                .query_row("PRAGMA user_version", [], |r| r.get(0))
                .unwrap();
            assert_eq!(version, 7);
            let name: Option<String> = restored
                .query_row("SELECT name FROM \"Acc\" WHERE id = 3", [], |r| r.get(0))
                .unwrap();
            assert_eq!(name, None);
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dump_is_deterministic() {
        let conn = Connection::open_in_memory().unwrap();
        sample(&conn);
        assert_eq!(dump_sql(&conn).unwrap(), dump_sql(&conn).unwrap());
    }

    #[test]
    fn prune_keeps_newest_per_day_for_14_days() {
        let dir = temp_dir("prune-days");
        let mut names: Vec<String> = (0..20).map(|k| snap_name(today() - k, "090000")).collect();
        names.push(snap_name(today(), "080000"));
        names.push("cibi-latest.sql".to_string());
        names.push("notes.txt".to_string());
        touch(&dir, &names);

        // A year later no snapshot falls in the 8-week window, so only the day rule applies.
        prune(&dir, (today() + 365) * 86_400).unwrap();

        let mut expect: Vec<String> = (0..14).map(|k| snap_name(today() - k, "090000")).collect();
        expect.push("cibi-latest.sql".to_string());
        expect.push("notes.txt".to_string());
        expect.sort();
        assert_eq!(remaining(&dir), expect);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_keeps_newest_per_recent_week() {
        let dir = temp_dir("prune-weeks");
        let mut names: Vec<String> = (0..14).map(|k| snap_name(today() - k, "090000")).collect();
        names.push(snap_name(today() - 40, "080000"));
        names.push(snap_name(today() - 40, "090000"));
        names.push(snap_name(today() - 60, "090000"));
        names.push(snap_name(today() - 75, "090000"));
        touch(&dir, &names);

        prune(&dir, today() * 86_400 + 43_200).unwrap();

        let mut expect: Vec<String> = (0..14).map(|k| snap_name(today() - k, "090000")).collect();
        expect.push(snap_name(today() - 40, "090000"));
        expect.sort();
        assert_eq!(remaining(&dir), expect);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn run_backup_skips_dump_and_snapshot_when_unchanged() {
        let dir = temp_dir("run");
        let backups = dir.join("backups");
        let conn = Connection::open_in_memory().unwrap();
        sample(&conn);
        let now = today() * 86_400;

        run_backup(&conn, &backups, "20261015-090000", now).unwrap();
        let latest = backups.join("cibi-latest.sql");
        let written = fs::metadata(&latest).unwrap().modified().unwrap();
        assert_eq!(snapshots(&backups).unwrap().len(), 1);

        run_backup(&conn, &backups, "20261015-100000", now).unwrap();
        assert_eq!(fs::metadata(&latest).unwrap().modified().unwrap(), written);
        assert_eq!(snapshots(&backups).unwrap().len(), 1);

        conn.execute_batch("INSERT INTO \"Acc\" (name) VALUES ('new');")
            .unwrap();
        run_backup(&conn, &backups, "20261015-110000", now).unwrap();
        assert!(backups.join("cibi-20261015-110000.db").exists());
        assert_eq!(snapshots(&backups).unwrap().len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn restore_file_refuses_existing_target() {
        let dir = temp_dir("refuse");
        let src = dir.join("a.sql");
        fs::write(&src, "CREATE TABLE t (x);").unwrap();
        let target = dir.join("cibi.db");
        fs::write(&target, b"x").unwrap();
        assert!(restore_file(&src, &target).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stamp_formats_utc() {
        assert_eq!(format_stamp(0), "19700101-000000");
        assert_eq!(format_stamp(today() * 86_400 + 43_200), "20261015-120000");
        assert_eq!(
            days_from_civil(2024, 2, 29) + 1,
            days_from_civil(2024, 3, 1)
        );
    }
}
