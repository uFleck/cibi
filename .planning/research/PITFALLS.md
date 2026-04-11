# Domain Pitfalls: Go + SQLite Personal Finance Application

**Domain:** Personal finance decision engine (Go + SQLite, local-first)
**Researched:** 2026-04-11
**Confidence:** HIGH (all five dimensions verified against multiple sources)

---

## Critical Pitfalls

Mistakes that cause silent data corruption, calculation errors, or deployment blockers.

---

### Pitfall 1: Using float64 for Money — Silent Data Corruption

**What goes wrong:** Floating-point arithmetic on monetary values produces silently wrong results. `0.1 + 0.2` in IEEE 754 float64 does not equal `0.3`. These errors accumulate across calculations (recurring projections, balance totals) and produce incorrect "Can I Buy It?" decisions without any error or panic.

**Why it happens:** Go's `float64` is IEEE 754 binary64. Most cent values (e.g., $10.99 = 0.99 cents) have no exact binary representation. The error is typically sub-cent but is non-zero and compounds.

**Consequences:** The balance projection used by the core CIBI engine (`balance - sum(upcoming recurring obligations)`) will drift. With even 10 recurring transactions the accumulated error can visibly shift displayed values. Stored `REAL` values in SQLite compound this further — SQLite explicitly warns that only 0.00, 0.25, 0.50, and 0.75 can be exactly represented in REAL.

**Prevention — concrete recommendation:**

Store all monetary amounts as **integer cents** (int64) in both Go and SQLite. $19.99 = `1999`. Display-only formatting converts back to decimal.

```go
// Store and compute in cents
type Cents int64

func (c Cents) String() string {
    return fmt.Sprintf("$%d.%02d", c/100, abs(c%100))
}

// SQLite schema: amount INTEGER NOT NULL  (never REAL)
```

For amounts that require division (e.g., splitting a $100 annual fee into monthly portions), use `govalues/decimal` for the intermediate calculation, then round back to `Cents` before storing. Do **not** use `shopspring/decimal` for this project — it is 7-10x slower and heap-allocates heavily for no benefit at the scale of a two-user personal finance app.

**Detection:** Write a test: `assert 10 + 20 + 30 = 60` in cents, then `0.10 + 0.20 + 0.30 = 0.60` as float64. The float version fails.

**Confidence:** HIGH — verified against SQLite official docs, multiple Go production articles, and govalues benchmark data.

---

### Pitfall 2: CGO Requirement of mattn/go-sqlite3 Breaks Single-Binary Distribution

**What goes wrong:** `mattn/go-sqlite3` requires CGO (`CGO_ENABLED=1`) and a C compiler (gcc/clang) at build time. This means:
- `go build` fails without a C compiler present
- Cross-compilation (build on Mac, deploy on Linux, or vice versa) requires a full cross-compile C toolchain per target OS
- GitHub Actions / CI pipelines need explicit C toolchain setup
- Any `go install` from source by a user on a machine without gcc will fail with a cryptic error

**Why it happens:** `go-sqlite3` is a CGO wrapper around the SQLite C amalgamation. CGO disables Go's native cross-compilation.

**Consequences:** A user who clones the repo and runs `go install ./cmd/cibi` will get: `Binary was compiled with 'CGO_ENABLED=0', go-sqlite3 requires cgo to work.` This is a common, well-documented failure mode with hundreds of GitHub issues.

**Prevention — concrete recommendation:**

Use **`modernc.org/sqlite`** (pure Go, transpiled C) or **`github.com/ncruces/go-sqlite3`** (WASM via wazero) instead of `mattn/go-sqlite3`.

| Driver | CGO Required | Cross-Compile | Performance | Compatibility |
|--------|-------------|---------------|-------------|---------------|
| `mattn/go-sqlite3` | Yes | Hard | Fastest | 100% SQLite |
| `modernc.org/sqlite` | No | Yes | ~2x slower on writes | High |
| `ncruces/go-sqlite3` | No | Yes | Faster than modernc | 100% SQLite (original C via WASM) |

For CIBI: choose `modernc.org/sqlite`. It is the most battle-tested pure-Go option, used in production by projects like Gogs. The 2x write-speed penalty is irrelevant for a two-user personal finance app with no write concurrency pressure.

If you want 100% SQLite compatibility and slightly better performance, `ncruces/go-sqlite3` (wazero WASM) is an excellent alternative — it compiles the original SQLite C to WASM and runs it via the pure-Go wazero runtime, with broad platform test coverage. However, it adds binary size and a less familiar import pattern.

```go
// modernc.org/sqlite — drop-in replacement, no other code changes
import _ "modernc.org/sqlite"

db, err := sql.Open("sqlite", "./cibi.db?_journal_mode=WAL&_busy_timeout=5000")
```

**Detection:** Run `CGO_ENABLED=0 go build ./...` in CI. If it builds, you're safe.

**Confidence:** HIGH — verified against mattn/go-sqlite3 README, modernc pkg.go.dev, ncruces GitHub releases, and multiple production reports.

---

### Pitfall 3: SQLite Connection/Concurrency Misconfiguration Causes "database is locked"

**What goes wrong:** Even with only two users and no real concurrency pressure, the default `database/sql` connection pool opens multiple connections to SQLite. When two goroutines attempt writes simultaneously (e.g., web request + background recurring-transaction scheduler), SQLite returns `SQLITE_BUSY`. Without WAL mode and a busy timeout configured in the connection string, these errors surface as runtime failures.

**Why it happens:** SQLite's default journal mode (DELETE/rollback) blocks readers during writes. WAL mode allows concurrent reads, but still permits only one writer. Go's `database/sql` pool defaults to no connection limit, spinning up multiple connections that contend for the write lock. The `busy_timeout` PRAGMA must be set per-connection, and if set on a pool connection that gets returned and re-opened, it may not persist.

**Consequences:** Intermittent 500 errors from the API under light concurrent use. Hard to reproduce locally. Even with `_busy_timeout` in the DSN, if the connection is opened without `SetMaxOpenConns(1)` on the writer, the timeout can be applied to a different connection than the one waiting.

**Prevention — concrete recommendation:**

Apply all pragmas at open time via the DSN, and cap the writer pool to 1 connection:

```go
// Open with pragmas baked in
dsn := "file:cibi.db?_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL&_foreign_keys=ON"
db, err := sql.Open("sqlite", dsn)

// Single writer prevents ALL "database is locked" errors by design
db.SetMaxOpenConns(1)
```

If you split into separate read and write pools (not necessary for CIBI given the load profile), set `SetMaxOpenConns(1)` only on the writer pool and allow multiple connections on the reader pool.

**Detection:** Write an integration test that fires two concurrent INSERT goroutines and assert neither returns an error.

**Confidence:** HIGH — verified against SQLite WAL docs, mattn/go-sqlite3 issue #1203, and Bert Hubert's analysis of SQLITE_BUSY behavior.

---

## Moderate Pitfalls

---

### Pitfall 4: Date Arithmetic for Recurring Transactions — Month-End Normalization and DST

**What goes wrong:** Two independent bugs lurk in recurring transaction scheduling.

**Bug A — Month-end overflow:** Go's `time.AddDate(0, 1, 0)` normalizes overflows. Adding one month to January 31 yields March 2 (or 3 in leap years), not February 28. A recurring rent payment set to the 31st will silently shift forward each month.

```go
t := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)
next := t.AddDate(0, 1, 0)
// next = 2025-03-02, NOT 2025-02-28
```

**Bug B — DST wall-clock drift:** `AddDate` adds calendar days, not duration. In a DST-observing timezone, `AddDate(0, 0, 1)` on the day of a clock change produces a next-occurrence that is 23 or 25 hours later in absolute time — the wall clock reads the same but the `time.Time` value differs from expectation. This matters if you're comparing `now > next_occurrence` using absolute time.

**Prevention — concrete recommendation:**

1. Store all `next_occurrence` timestamps as **UTC** in SQLite (`TEXT` column, ISO-8601 format: `2025-03-01T00:00:00Z`). Do not store local time with timezone offset.
2. For monthly recurrence, clamp to end-of-month when the anchor day exceeds the target month's days:

```go
func nextMonthlyOccurrence(anchor time.Time, from time.Time) time.Time {
    // Use anchor day-of-month, clamp to end of target month
    anchorDay := anchor.Day()
    next := time.Date(from.Year(), from.Month()+1, 1, 0, 0, 0, 0, time.UTC)
    lastDay := next.AddDate(0, 1, -1).Day() // last day of next month
    day := anchorDay
    if day > lastDay {
        day = lastDay
    }
    return time.Date(next.Year(), next.Month(), day, 0, 0, 0, 0, time.UTC)
}
```

3. Do all "is this transaction due?" comparisons in UTC. Only convert to local time at the display layer.
4. Store the anchor day-of-month as a separate integer column alongside `next_occurrence` so the clamping logic can be applied consistently on recalculation.

**Detection:** Unit test: create a monthly recurring transaction anchored to Jan 31. Assert the February occurrence is Feb 28 (or 29), not March 2 or 3.

**Confidence:** HIGH (AddDate normalization is documented in Go stdlib issue #41272 and the time package docs). MEDIUM for DST interaction (confirmed by Go issue #24551 but less commonly a problem when storing UTC).

---

### Pitfall 5: Schema Migration — No Strategy Leads to Manual Pain

**What goes wrong:** Starting without a migration tool means schema changes accumulate as ad-hoc `ALTER TABLE` statements or full schema drops. After the first production deployment, destroying the SQLite file to change schema is not acceptable (user data loss).

**Why it happens:** SQLite supports only a limited subset of `ALTER TABLE` (add column, rename column, rename table — no drop column, no change column type). Any structural change requires the "12-step SQLite table alteration" (create new table, copy data, drop old, rename). Without a migration runner tracking applied migrations, there is no way to know what state the database is in.

**Prevention — concrete recommendation:**

Use **`pressly/goose` v3** with embedded SQL migrations. It is the most idiomatic Go migration tool for projects without an ORM, supports SQLite, and integrates cleanly with `//go:embed` so migrations are compiled into the binary.

```
internal/
  migrations/
    00001_initial_schema.sql
    00002_add_safety_buffer.sql
```

```go
//go:embed migrations/*.sql
var migrations embed.FS

func RunMigrations(db *sql.DB) error {
    goose.SetDialect("sqlite3")
    goose.SetBaseFS(migrations)
    return goose.Up(db, "migrations")
}
```

Call `RunMigrations` at startup before serving any requests. Goose creates a `goose_db_version` table to track applied migrations.

Avoid Atlas for this project — it is powerful but over-engineered for a two-user local app. Avoid `golang-migrate` — it is fine but less actively maintained and its SQLite locking behavior has had known issues.

**Confidence:** HIGH — verified against pressly/goose README, embed migration docs (2024 blog post), and Atlas/golang-migrate comparison from atlasgo.io.

---

## Minor Pitfalls

---

### Pitfall 6: SQLite Timestamp Parsing in Go — Silent Zero-Value on Format Mismatch

**What goes wrong:** `mattn/go-sqlite3` (and by extension modernc) parses `time.Time` values from SQLite TEXT columns using a set of known formats. If your stored format does not match one of these formats, the scan returns `time.Time{}` (zero value, year 0001) without an error.

**Prevention:** Store timestamps exclusively as `"2006-01-02T15:04:05Z"` (Go's RFC3339 format). Use `time.Now().UTC().Format(time.RFC3339)` for all inserts. Add a `CHECK` constraint on the column: `CHECK(length(created_at) >= 10)` as a minimal guard.

**Confidence:** MEDIUM — verified against mattn/go-sqlite3 issue #748 and SQLite timestamp handling docs.

---

### Pitfall 7: SQLite INTEGER Affinity and Large Cent Values

**What goes wrong:** SQLite stores integers as 64-bit signed integers, which holds up to ~9.2 × 10^18. For cents this is safe for any conceivable personal finance amount (max ~$92 quadrillion). However, if you accidentally define the column with `NUMERIC` affinity (common mistake when copying Postgres schemas), SQLite may coerce large integers to REAL, silently losing precision.

**Prevention:** Always declare money columns as `INTEGER` not `NUMERIC`, `DECIMAL`, or `REAL` in SQLite DDL. Verify: `SELECT typeof(amount) FROM transactions LIMIT 1` should return `integer`.

**Confidence:** HIGH — verified against SQLite data types documentation and Jake Goulding's analysis of SQLite 64-bit integer edge cases.

---

### Pitfall 8: Missing `_foreign_keys=ON` Pragma

**What goes wrong:** SQLite does not enforce foreign key constraints by default. Without `PRAGMA foreign_keys = ON`, you can insert a `Transaction` row referencing a non-existent `Account` ID and SQLite will accept it silently. This creates orphaned rows that break balance calculations.

**Prevention:** Include `_foreign_keys=ON` in your DSN connection string. With `modernc.org/sqlite`, this is: `"file:cibi.db?_foreign_keys=ON"`. Verify it is active with `PRAGMA foreign_keys;` returning `1`.

**Confidence:** HIGH — SQLite official docs, universally documented.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Initial schema design | No migration runner → painful schema evolution | Add goose on day one, before any data |
| Money amount fields | REAL type in schema → silent float errors | Use INTEGER (cents), enforce in DDL |
| Recurring transaction engine | AddDate month-end normalization → wrong due dates | Store anchor day separately, clamp to month-end |
| Binary distribution / CI | mattn/go-sqlite3 CGO → build failures without gcc | Use modernc.org/sqlite from the start |
| API server startup | Multiple DB connections → SQLITE_BUSY | SetMaxOpenConns(1), WAL mode, busy_timeout |
| Date comparisons in engine | Local timezone stored in DB → DST comparison drift | UTC everywhere, local time only at display |
| Testing money calculations | Float64 test values → tests pass, prod wrong | All test fixtures in cents (int64) |

---

## Sources

- SQLite official floating point documentation: https://sqlite.org/floatingpoint.html
- govalues/decimal benchmarks vs shopspring: https://github.com/govalues/decimal
- shopspring/decimal GitHub: https://github.com/shopspring/decimal
- modernc.org/sqlite Go package: https://pkg.go.dev/modernc.org/sqlite
- ncruces/go-sqlite3 (wazero): https://github.com/ncruces/go-sqlite3
- mattn/go-sqlite3 CGO issue #855: https://github.com/mattn/go-sqlite3/issues/855
- SQLite WAL mode official docs: https://sqlite.org/wal.html
- "database is locked" in WAL mode: https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/
- SQLITE_BUSY despite timeout (Bert Hubert): https://berthug.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/
- pressly/goose embed migrations: https://pressly.github.io/goose/blog/2021/embed-sql-migrations/
- pressly/goose + sqlc (2024): https://pressly.github.io/goose/blog/2024/goose-sqlc/
- Go time.AddDate DST issue #41272: https://github.com/golang/go/issues/41272
- Go time.AddDate month-end normalization: https://pkg.go.dev/time
- SQLite timestamp handling issue (mattn): https://github.com/mattn/go-sqlite3/issues/748
- Atlas vs golang-migrate comparison: https://atlasgo.io/blog/2025/04/06/atlas-and-golang-migrate
- SQLite 64-bit integer edge case: http://jakegoulding.com/blog/2011/02/06/sqlite-64-bit-integers/
- go-sqlite-bench (driver performance benchmarks): https://github.com/cvilsmeier/go-sqlite-bench
