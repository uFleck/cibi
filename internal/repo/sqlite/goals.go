package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

var ValidGoalStatuses = map[string]bool{"draft": true, "active": true, "completed": true, "archived": true}
var ValidGoalLedgerTypes = map[string]bool{"contribution": true, "withdrawal": true, "adjustment": true}
var ValidGoalLedgerSources = map[string]bool{"manual": true, "system": true, "recurring": true}

type Goal struct {
	ID                               uuid.UUID
	AccountID                        uuid.UUID
	Name                             string
	Status                           string
	TargetAmountCents                int64
	InvestedTotalCents               int64
	MinContributionPerWindowCents    int64
	StartDateUTC                     time.Time
	TargetDateUTC                    *time.Time
	Notes                            *string
	Currency                         string
	CreatedAtUTC                     time.Time
	UpdatedAtUTC                     time.Time
}

type GoalLedgerEntry struct {
	ID              uuid.UUID
	GoalID          uuid.UUID
	AmountCents     int64
	Type            string
	Source          string
	Note            *string
	ReversesEntryID *uuid.UUID
	TimestampUTC    time.Time
	CreatedAtUTC    time.Time
}

type GoalsRepo interface {
	InsertGoal(g Goal, tx *sql.Tx) error
	GetGoalsByAccount(accountID uuid.UUID) ([]Goal, error)
	GetGoalByID(id uuid.UUID) (Goal, error)
	UpdateGoal(id uuid.UUID, upd UpdateGoal, tx *sql.Tx) error
	InsertLedgerEntry(entry GoalLedgerEntry, tx *sql.Tx) error
	ListLedgerByGoal(goalID uuid.UUID) ([]GoalLedgerEntry, error)
	GetLedgerEntryByID(id uuid.UUID) (GoalLedgerEntry, error)
	AddTargetAudit(a GoalTargetAudit, tx *sql.Tx) error
	InsertRecurring(r GoalRecurringContribution, tx *sql.Tx) error
	ListRecurringByAccount(accountID uuid.UUID) ([]GoalRecurringContribution, error)
	GetRecurringByID(id uuid.UUID) (GoalRecurringContribution, error)
	UpdateRecurring(id uuid.UUID, upd UpdateGoalRecurringContribution, tx *sql.Tx) error
}

type UpdateGoal struct {
	Name               *string
	Status             *string
	TargetAmountCents  *int64
	InvestedTotalCents *int64
	TargetDateUTC                   *time.Time
	Notes                           *string
	MinContributionPerWindowCents   *int64
	UpdatedAtUTC                    *time.Time
}

type GoalTargetAudit struct {
	ID                        uuid.UUID
	GoalID                    uuid.UUID
	PreviousTargetAmountCents int64
	NewTargetAmountCents      int64
	ChangedAtUTC              time.Time
	Note                      *string
}

type GoalRecurringContribution struct {
	ID            uuid.UUID
	GoalID        uuid.UUID
	AmountCents   int64
	Frequency     string
	AnchorDateUTC time.Time
	NextDueUTC    time.Time
	Active        bool
	CreatedAtUTC  time.Time
	UpdatedAtUTC  time.Time
}

type UpdateGoalRecurringContribution struct {
	NextDueUTC   *time.Time
	Active       *bool
	UpdatedAtUTC *time.Time
}

type SqliteGoalsRepo struct{ db *sql.DB }

func NewSqliteGoalsRepo(db *sql.DB) *SqliteGoalsRepo { return &SqliteGoalsRepo{db: db} }

func (r *SqliteGoalsRepo) InsertGoal(g Goal, tx *sql.Tx) error {
	if !ValidGoalStatuses[g.Status] {
		return fmt.Errorf("goals.InsertGoal: invalid status")
	}
	exec := r.db.Exec
	if tx != nil {
		exec = tx.Exec
	}
	_, err := exec(`INSERT INTO Goal (id, account_id, name, status, target_amount_cents, invested_total_cents, min_contribution_per_window_cents, start_date_utc, target_date_utc, notes, currency, created_at_utc, updated_at_utc)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		g.ID.String(), g.AccountID.String(), g.Name, g.Status, g.TargetAmountCents, g.InvestedTotalCents, g.MinContributionPerWindowCents,
		g.StartDateUTC.UTC().Format(time.RFC3339), nullTime(g.TargetDateUTC), g.Notes, g.Currency,
		g.CreatedAtUTC.UTC().Format(time.RFC3339), g.UpdatedAtUTC.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("goals.InsertGoal: %w", err)
	}
	return nil
}

func (r *SqliteGoalsRepo) GetGoalsByAccount(accountID uuid.UUID) ([]Goal, error) {
	rows, err := r.db.Query(`SELECT id, account_id, name, status, target_amount_cents, invested_total_cents, min_contribution_per_window_cents, start_date_utc, target_date_utc, notes, currency, created_at_utc, updated_at_utc FROM Goal WHERE account_id = ?`, accountID.String())
	if err != nil {
		return nil, fmt.Errorf("goals.GetGoalsByAccount: %w", err)
	}
	defer rows.Close()
	var out []Goal
	for rows.Next() {
		g, err := scanGoal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *SqliteGoalsRepo) GetGoalByID(id uuid.UUID) (Goal, error) {
	row := r.db.QueryRow(`SELECT id, account_id, name, status, target_amount_cents, invested_total_cents, min_contribution_per_window_cents, start_date_utc, target_date_utc, notes, currency, created_at_utc, updated_at_utc FROM Goal WHERE id = ?`, id.String())
	return scanGoalRow(row)
}

func (r *SqliteGoalsRepo) UpdateGoal(id uuid.UUID, upd UpdateGoal, tx *sql.Tx) error {
	exec := r.db.Exec
	if tx != nil {
		exec = tx.Exec
	}
	if upd.Name != nil {
		if _, err := exec(`UPDATE Goal SET name = ? WHERE id = ?`, *upd.Name, id.String()); err != nil {
			return err
		}
	}
	if upd.Status != nil {
		if _, err := exec(`UPDATE Goal SET status = ? WHERE id = ?`, *upd.Status, id.String()); err != nil {
			return err
		}
	}
	if upd.TargetAmountCents != nil {
		if _, err := exec(`UPDATE Goal SET target_amount_cents = ? WHERE id = ?`, *upd.TargetAmountCents, id.String()); err != nil {
			return err
		}
	}
	if upd.InvestedTotalCents != nil {
		if _, err := exec(`UPDATE Goal SET invested_total_cents = ? WHERE id = ?`, *upd.InvestedTotalCents, id.String()); err != nil {
			return err
		}
	}
	if upd.TargetDateUTC != nil {
		if _, err := exec(`UPDATE Goal SET target_date_utc = ? WHERE id = ?`, upd.TargetDateUTC.UTC().Format(time.RFC3339), id.String()); err != nil {
			return err
		}
	}
	if upd.Notes != nil {
		if _, err := exec(`UPDATE Goal SET notes = ? WHERE id = ?`, *upd.Notes, id.String()); err != nil {
			return err
		}
	}
	if upd.MinContributionPerWindowCents != nil {
		if _, err := exec(`UPDATE Goal SET min_contribution_per_window_cents = ? WHERE id = ?`, *upd.MinContributionPerWindowCents, id.String()); err != nil {
			return err
		}
	}
	if upd.UpdatedAtUTC != nil {
		if _, err := exec(`UPDATE Goal SET updated_at_utc = ? WHERE id = ?`, upd.UpdatedAtUTC.UTC().Format(time.RFC3339), id.String()); err != nil {
			return err
		}
	}
	return nil
}

func (r *SqliteGoalsRepo) InsertLedgerEntry(entry GoalLedgerEntry, tx *sql.Tx) error {
	if !ValidGoalLedgerTypes[entry.Type] {
		return fmt.Errorf("goals.InsertLedgerEntry: invalid type")
	}
	if !ValidGoalLedgerSources[entry.Source] {
		return fmt.Errorf("goals.InsertLedgerEntry: invalid source")
	}
	exec := r.db.Exec
	if tx != nil {
		exec = tx.Exec
	}
	_, err := exec(`INSERT INTO GoalLedgerEntry (id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ID.String(), entry.GoalID.String(), entry.AmountCents, entry.Type, entry.Source, entry.Note,
		nullUUID(entry.ReversesEntryID), entry.TimestampUTC.UTC().Format(time.RFC3339), entry.CreatedAtUTC.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("goals.InsertLedgerEntry: %w", err)
	}
	return nil
}

func (r *SqliteGoalsRepo) ListLedgerByGoal(goalID uuid.UUID) ([]GoalLedgerEntry, error) {
	rows, err := r.db.Query(`SELECT id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc FROM GoalLedgerEntry WHERE goal_id = ? ORDER BY timestamp_utc ASC`, goalID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GoalLedgerEntry
	for rows.Next() {
		e, err := scanGoalLedger(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *SqliteGoalsRepo) GetLedgerEntryByID(id uuid.UUID) (GoalLedgerEntry, error) {
	row := r.db.QueryRow(`SELECT id, goal_id, amount_cents, type, source, note, reverses_entry_id, timestamp_utc, created_at_utc FROM GoalLedgerEntry WHERE id = ?`, id.String())
	return scanGoalLedgerRow(row)
}

func (r *SqliteGoalsRepo) AddTargetAudit(a GoalTargetAudit, tx *sql.Tx) error {
	exec := r.db.Exec
	if tx != nil {
		exec = tx.Exec
	}
	_, err := exec(`INSERT INTO GoalTargetAudit (id, goal_id, previous_target_amount_cents, new_target_amount_cents, changed_at_utc, note) VALUES (?, ?, ?, ?, ?, ?)`,
		a.ID.String(), a.GoalID.String(), a.PreviousTargetAmountCents, a.NewTargetAmountCents, a.ChangedAtUTC.UTC().Format(time.RFC3339), a.Note,
	)
	return err
}

func (r *SqliteGoalsRepo) InsertRecurring(rec GoalRecurringContribution, tx *sql.Tx) error {
	exec := r.db.Exec
	if tx != nil {
		exec = tx.Exec
	}
	_, err := exec(`INSERT INTO GoalRecurringContribution (id, goal_id, amount_cents, frequency, anchor_date_utc, next_due_utc, active, created_at_utc, updated_at_utc)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		rec.ID.String(), rec.GoalID.String(), rec.AmountCents, rec.Frequency,
		rec.AnchorDateUTC.UTC().Format(time.RFC3339), rec.NextDueUTC.UTC().Format(time.RFC3339), rec.Active,
		rec.CreatedAtUTC.UTC().Format(time.RFC3339), rec.UpdatedAtUTC.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("goals.InsertRecurring: %w", err)
	}
	return nil
}

func (r *SqliteGoalsRepo) ListRecurringByAccount(accountID uuid.UUID) ([]GoalRecurringContribution, error) {
	rows, err := r.db.Query(`SELECT grc.id, grc.goal_id, grc.amount_cents, grc.frequency, grc.anchor_date_utc, grc.next_due_utc, grc.active, grc.created_at_utc, grc.updated_at_utc
FROM GoalRecurringContribution grc
JOIN Goal g ON g.id = grc.goal_id
WHERE g.account_id = ? AND grc.active = 1
ORDER BY grc.next_due_utc ASC`, accountID.String())
	if err != nil {
		return nil, fmt.Errorf("goals.ListRecurringByAccount: %w", err)
	}
	defer rows.Close()
	var out []GoalRecurringContribution
	for rows.Next() {
		r, err := scanGoalRecurring(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (r *SqliteGoalsRepo) GetRecurringByID(id uuid.UUID) (GoalRecurringContribution, error) {
	row := r.db.QueryRow(`SELECT id, goal_id, amount_cents, frequency, anchor_date_utc, next_due_utc, active, created_at_utc, updated_at_utc FROM GoalRecurringContribution WHERE id = ?`, id.String())
	return scanGoalRecurringRow(row)
}

func (r *SqliteGoalsRepo) UpdateRecurring(id uuid.UUID, upd UpdateGoalRecurringContribution, tx *sql.Tx) error {
	exec := r.db.Exec
	if tx != nil {
		exec = tx.Exec
	}
	if upd.NextDueUTC != nil {
		if _, err := exec(`UPDATE GoalRecurringContribution SET next_due_utc = ? WHERE id = ?`, upd.NextDueUTC.UTC().Format(time.RFC3339), id.String()); err != nil {
			return fmt.Errorf("goals.UpdateRecurring: %w", err)
		}
	}
	if upd.Active != nil {
		if _, err := exec(`UPDATE GoalRecurringContribution SET active = ? WHERE id = ?`, *upd.Active, id.String()); err != nil {
			return fmt.Errorf("goals.UpdateRecurring: %w", err)
		}
	}
	if upd.UpdatedAtUTC != nil {
		if _, err := exec(`UPDATE GoalRecurringContribution SET updated_at_utc = ? WHERE id = ?`, upd.UpdatedAtUTC.UTC().Format(time.RFC3339), id.String()); err != nil {
			return fmt.Errorf("goals.UpdateRecurring: %w", err)
		}
	}
	return nil
}

func scanGoalRecurring(rows *sql.Rows) (GoalRecurringContribution, error) {
	var r GoalRecurringContribution
	var id, goalID, anchor, due, created, updated string
	if err := rows.Scan(&id, &goalID, &r.AmountCents, &r.Frequency, &anchor, &due, &r.Active, &created, &updated); err != nil {
		return r, err
	}
	return fillGoalRecurring(r, id, goalID, anchor, due, created, updated)
}

func scanGoalRecurringRow(row *sql.Row) (GoalRecurringContribution, error) {
	var r GoalRecurringContribution
	var id, goalID, anchor, due, created, updated string
	if err := row.Scan(&id, &goalID, &r.AmountCents, &r.Frequency, &anchor, &due, &r.Active, &created, &updated); err != nil {
		return r, err
	}
	return fillGoalRecurring(r, id, goalID, anchor, due, created, updated)
}

func fillGoalRecurring(r GoalRecurringContribution, id, goalID, anchor, due, created, updated string) (GoalRecurringContribution, error) {
	var err error
	r.ID, err = uuid.Parse(id)
	if err != nil {
		return r, err
	}
	r.GoalID, err = uuid.Parse(goalID)
	if err != nil {
		return r, err
	}
	r.AnchorDateUTC, err = time.Parse(time.RFC3339, anchor)
	if err != nil {
		return r, err
	}
	r.NextDueUTC, err = time.Parse(time.RFC3339, due)
	if err != nil {
		return r, err
	}
	r.CreatedAtUTC, err = time.Parse(time.RFC3339, created)
	if err != nil {
		return r, err
	}
	r.UpdatedAtUTC, err = time.Parse(time.RFC3339, updated)
	if err != nil {
		return r, err
	}
	return r, nil
}

func scanGoal(rows *sql.Rows) (Goal, error) {
	var g Goal
	var id, acc, start, created, updated string
	var target, notes sql.NullString
	if err := rows.Scan(&id, &acc, &g.Name, &g.Status, &g.TargetAmountCents, &g.InvestedTotalCents, &g.MinContributionPerWindowCents, &start, &target, &notes, &g.Currency, &created, &updated); err != nil {
		return g, err
	}
	return fillGoal(g, id, acc, start, target, notes, created, updated)
}
func scanGoalRow(row *sql.Row) (Goal, error) {
	var g Goal
	var id, acc, start, created, updated string
	var target, notes sql.NullString
	if err := row.Scan(&id, &acc, &g.Name, &g.Status, &g.TargetAmountCents, &g.InvestedTotalCents, &g.MinContributionPerWindowCents, &start, &target, &notes, &g.Currency, &created, &updated); err != nil {
		return g, err
	}
	return fillGoal(g, id, acc, start, target, notes, created, updated)
}
func fillGoal(g Goal, id, acc, start string, target, notes sql.NullString, created, updated string) (Goal, error) {
	var err error
	g.ID, err = uuid.Parse(id)
	if err != nil {
		return g, err
	}
	g.AccountID, err = uuid.Parse(acc)
	if err != nil {
		return g, err
	}
	g.StartDateUTC, err = time.Parse(time.RFC3339, start)
	if err != nil {
		return g, err
	}
	if target.Valid && target.String != "" {
		t, err := time.Parse(time.RFC3339, target.String)
		if err != nil {
			return g, err
		}
		g.TargetDateUTC = &t
	}
	if notes.Valid {
		n := notes.String
		g.Notes = &n
	}
	g.CreatedAtUTC, _ = time.Parse(time.RFC3339, created)
	g.UpdatedAtUTC, _ = time.Parse(time.RFC3339, updated)
	return g, nil
}
func scanGoalLedger(rows *sql.Rows) (GoalLedgerEntry, error) {
	var e GoalLedgerEntry
	var id, gid, ts, created string
	var rev, note sql.NullString
	if err := rows.Scan(&id, &gid, &e.AmountCents, &e.Type, &e.Source, &note, &rev, &ts, &created); err != nil {
		return e, err
	}
	return fillGoalLedger(e, id, gid, rev, note, ts, created)
}
func scanGoalLedgerRow(row *sql.Row) (GoalLedgerEntry, error) {
	var e GoalLedgerEntry
	var id, gid, ts, created string
	var rev, note sql.NullString
	if err := row.Scan(&id, &gid, &e.AmountCents, &e.Type, &e.Source, &note, &rev, &ts, &created); err != nil {
		return e, err
	}
	return fillGoalLedger(e, id, gid, rev, note, ts, created)
}
func fillGoalLedger(e GoalLedgerEntry, id, gid string, rev, note sql.NullString, ts, created string) (GoalLedgerEntry, error) {
	var err error
	e.ID, err = uuid.Parse(id)
	if err != nil {
		return e, err
	}
	e.GoalID, err = uuid.Parse(gid)
	if err != nil {
		return e, err
	}
	if note.Valid {
		n := note.String
		e.Note = &n
	}
	if rev.Valid && rev.String != "" {
		rv, err := uuid.Parse(rev.String)
		if err != nil {
			return e, err
		}
		e.ReversesEntryID = &rv
	}
	e.TimestampUTC, err = time.Parse(time.RFC3339, ts)
	if err != nil {
		return e, err
	}
	e.CreatedAtUTC, err = time.Parse(time.RFC3339, created)
	if err != nil {
		return e, err
	}
	return e, nil
}
func nullTime(v *time.Time) any {
	if v == nil {
		return nil
	}
	return v.UTC().Format(time.RFC3339)
}
func nullUUID(v *uuid.UUID) any {
	if v == nil {
		return nil
	}
	return v.String()
}
