use rusqlite::{
    params_from_iter,
    types::{Value as SqlValue, ValueRef},
    Connection,
};
use serde_json::{Map, Number, Value};
use std::{path::Path, sync::Mutex};
use tauri::State;

pub struct Db(pub Mutex<Connection>);

/// Opens the database with the same pragmas the Go server applies in internal/db/sqlite.go.
pub fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA busy_timeout=5000;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn to_sql(v: &Value) -> Result<SqlValue, String> {
    Ok(match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if n.is_u64() {
                return Err("integer parameter out of i64 range".to_string());
            } else {
                n.as_f64()
                    .map(SqlValue::Real)
                    .ok_or_else(|| "unsupported number parameter".to_string())?
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => return Err("unsupported parameter type".to_string()),
    })
}

fn from_ref(v: ValueRef<'_>) -> Result<Value, String> {
    Ok(match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => {
            Value::Number(Number::from_f64(f).ok_or_else(|| "non-finite real value".to_string())?)
        }
        ValueRef::Text(t) => Value::String(
            std::str::from_utf8(t)
                .map_err(|e| e.to_string())?
                .to_owned(),
        ),
        ValueRef::Blob(_) => return Err("blob columns are not supported".to_string()),
    })
}

pub fn query(
    conn: &Connection,
    sql: &str,
    params: &[Value],
) -> Result<Vec<Map<String, Value>>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let values = params
        .iter()
        .map(to_sql)
        .collect::<Result<Vec<SqlValue>, String>>()?;

    if stmt.column_count() == 0 {
        stmt.execute(params_from_iter(values.iter()))
            .map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }

    let mut rows = stmt
        .query(params_from_iter(values.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = Map::new();
        for (i, name) in names.iter().enumerate() {
            let v = row.get_ref(i).map_err(|e| e.to_string())?;
            obj.insert(name.clone(), from_ref(v)?);
        }
        out.push(obj);
    }
    Ok(out)
}

#[tauri::command]
pub async fn db_query(
    state: State<'_, Db>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    query(&conn, &sql, &params)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        query(
            &c,
            "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, amount INTEGER, ratio REAL)",
            &[],
        )
        .unwrap();
        c
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        query(conn, sql, &[]).unwrap()[0]["n"].as_i64().unwrap()
    }

    #[test]
    fn select_returns_typed_rows() {
        let c = mem();
        query(
            &c,
            "INSERT INTO t (name, amount, ratio) VALUES (?1, ?2, ?3)",
            &[json!("Mercado"), json!(12345), json!(0.5)],
        )
        .unwrap();
        query(
            &c,
            "INSERT INTO t (name, amount, ratio) VALUES (?1, ?2, ?3)",
            &[Value::Null, json!(7), Value::Null],
        )
        .unwrap();

        let rows = query(&c, "SELECT id, name, amount, ratio FROM t ORDER BY id", &[]).unwrap();
        assert_eq!(rows.len(), 2);

        let mut keys: Vec<&str> = rows[0].keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["amount", "id", "name", "ratio"]);

        assert_eq!(rows[0]["id"], json!(1));
        assert_eq!(rows[0]["name"], json!("Mercado"));
        assert_eq!(rows[0]["amount"], json!(12345));
        assert_eq!(rows[0]["ratio"], json!(0.5));

        assert_eq!(rows[1]["id"], json!(2));
        assert_eq!(rows[1]["name"], Value::Null);
        assert_eq!(rows[1]["amount"], json!(7));
        assert_eq!(rows[1]["ratio"], Value::Null);
    }

    #[test]
    fn write_statement_returns_empty_and_applies() {
        let c = mem();
        let out = query(
            &c,
            "INSERT INTO t (name, amount, ratio) VALUES (?1, ?2, ?3)",
            &[json!("a"), json!(1), json!(1.0)],
        )
        .unwrap();
        assert!(out.is_empty());
        assert_eq!(count(&c, "SELECT COUNT(*) AS n FROM t"), 1);
    }

    #[test]
    fn params_are_bound_and_bool_becomes_int() {
        let c = mem();
        let rows = query(&c, "SELECT ?1 AS a, ?2 AS b", &[json!(true), json!(42)]).unwrap();
        assert_eq!(rows[0]["a"], json!(1));
        assert_eq!(rows[0]["b"], json!(42));

        assert!(query(&c, "SELECT ?1 AS a", &[json!({"x": 1})]).is_err());
        assert!(query(&c, "SELECT ?1 AS a", &[json!([1, 2])]).is_err());
    }

    #[test]
    fn large_cents_round_trip() {
        let c = mem();
        for amount in [-14990_i64, 9_007_199_254_740_991_i64] {
            query(
                &c,
                "INSERT INTO t (name, amount) VALUES (?1, ?2)",
                &[json!("x"), json!(amount)],
            )
            .unwrap();
        }
        let rows = query(&c, "SELECT amount FROM t ORDER BY id", &[]).unwrap();
        assert_eq!(rows[0]["amount"].as_i64(), Some(-14990));
        assert_eq!(rows[1]["amount"].as_i64(), Some(9_007_199_254_740_991));
    }

    #[test]
    fn begin_commit_persists() {
        let c = mem();
        query(&c, "BEGIN IMMEDIATE", &[]).unwrap();
        query(
            &c,
            "INSERT INTO t (name, amount) VALUES (?1, ?2)",
            &[json!("a"), json!(100)],
        )
        .unwrap();
        query(&c, "COMMIT", &[]).unwrap();
        assert_eq!(count(&c, "SELECT COUNT(*) AS n FROM t"), 1);
    }

    #[test]
    fn begin_rollback_discards() {
        let c = mem();
        query(&c, "BEGIN IMMEDIATE", &[]).unwrap();
        query(
            &c,
            "INSERT INTO t (name, amount) VALUES (?1, ?2)",
            &[json!("a"), json!(100)],
        )
        .unwrap();
        query(&c, "ROLLBACK", &[]).unwrap();
        assert_eq!(count(&c, "SELECT COUNT(*) AS n FROM t"), 0);
    }

    #[test]
    fn write_then_read_inside_transaction() {
        let c = mem();
        query(&c, "BEGIN IMMEDIATE", &[]).unwrap();
        query(
            &c,
            "INSERT INTO t (name, amount) VALUES (?1, ?2)",
            &[json!("a"), json!(500)],
        )
        .unwrap();
        assert_eq!(count(&c, "SELECT SUM(amount) AS n FROM t"), 500);
        query(&c, "ROLLBACK", &[]).unwrap();
    }

    #[test]
    fn multiple_statements_are_rejected() {
        let c = mem();
        assert!(query(&c, "SELECT 1; SELECT 2", &[]).is_err());
    }

    #[test]
    fn open_sets_wal_and_foreign_keys() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_path =
            std::env::temp_dir().join(format!("cibi-p2-{}-{}.db", std::process::id(), nanos));
        {
            let conn = open(&db_path).unwrap();
            let mode: String = conn
                .query_row("PRAGMA journal_mode", [], |r| r.get(0))
                .unwrap();
            assert_eq!(mode, "wal");
            let fk: i64 = conn
                .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
                .unwrap();
            assert_eq!(fk, 1);
        }
        let base = db_path.to_string_lossy().to_string();
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{base}{suffix}"));
        }
    }

    #[test]
    #[ignore]
    fn reads_real_copy() {
        let path = std::env::var("CIBI_TEST_DB").expect("set CIBI_TEST_DB to a copy of cibi.db");
        let conn = open(Path::new(&path)).unwrap();
        let accounts = count(&conn, "SELECT COUNT(*) AS n FROM Account");
        let transactions = count(&conn, "SELECT COUNT(*) AS n FROM \"Transaction\"");
        println!("accounts={accounts} transactions={transactions}");
        assert!(accounts > 0);
        assert!(transactions > 0);
    }
}
