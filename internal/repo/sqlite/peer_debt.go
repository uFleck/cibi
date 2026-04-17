package sqlite

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/engine"
)

// PeerDebt represents a debt record between the user and a friend.
// Amount: positive = friend owes user, negative = user owes friend (in cents).
type PeerDebt struct {
	ID                uuid.UUID
	AccountID         uuid.UUID
	FriendID          uuid.UUID
	Amount            int64   // cents; positive = friend owes user, negative = user owes friend
	Description       string
	Date              string  // RFC3339
	IsInstallment     bool
	TotalInstallments *int64  // nullable
	PaidInstallments  int64   // default 0
	Frequency         *string // nullable, e.g. "monthly"
	AnchorDate        *string // nullable, RFC3339
	IsConfirmed       bool
}

// PeerDebtBalance holds balance aggregates for a single friend.
type PeerDebtBalance struct {
	FriendOwesUser int64 // sum of positive amounts (cents)
	UserOwesFriend int64 // abs(sum of negative amounts) (cents)
	Net            int64 // FriendOwesUser - UserOwesFriend (positive = friend net owes)
}

// GlobalPeerBalance holds balance aggregates across all friends.
type GlobalPeerBalance struct {
	TotalOwedToUser int64 // sum of all positive amounts across all friends
	TotalUserOwes   int64 // abs(sum of all negative amounts)
	Net             int64
}

// ActiveUserDebt is a flattened row used for computing the per-debt breakdown
// of debts the user owes to friends (amount < 0, still active).
type ActiveUserDebt struct {
	FriendName        string
	Amount            int64   // negative cents
	IsInstallment     bool
	TotalInstallments int64   // 0 if not installment
	PaidInstallments  int64
	Frequency         string  // "" if not set
	Date              string  // RFC3339 or date-only due date
	AnchorDate        *string // RFC3339 or date-only; nil if not set
}

// PeerDebtRepo defines the data access contract for peer debts.
type PeerDebtRepo interface {
	Insert(d PeerDebt) error
	GetByFriend(friendID uuid.UUID, accountID *uuid.UUID) ([]PeerDebt, error)
	GetAll(accountID *uuid.UUID) ([]PeerDebt, error)
	GetByID(id uuid.UUID) (PeerDebt, error)
	Update(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error
	DeleteByID(id uuid.UUID) error
	GetBalanceByFriend(friendID uuid.UUID, accountID *uuid.UUID) (PeerDebtBalance, error)
	GetGlobalBalance(accountID *uuid.UUID) (GlobalPeerBalance, error)
	SumUpcomingPeerObligations(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error)
	// SumNextUserPayment returns the total of the user's next payment for each active debt:
	// one installment amount for installment debts, full amount for unconfirmed lump-sum debts.
	SumNextUserPayment(accountID *uuid.UUID) (int64, error)
	// GetActiveUserDebtsWithFriend returns all active debts the user owes to friends,
	// joined with the friend name for display purposes.
	GetActiveUserDebtsWithFriend(accountID *uuid.UUID) ([]ActiveUserDebt, error)
	// ConfirmInstallment atomically increments paid_installments (capped at total_installments)
	// for installment debts, or sets is_confirmed=1 for non-installment debts.
	ConfirmInstallment(id uuid.UUID) error
}

// SqlitePeerDebtRepo implements PeerDebtRepo against modernc SQLite.
type SqlitePeerDebtRepo struct {
	db *sql.DB
}

// NewSqlitePeerDebtRepo creates a new SqlitePeerDebtRepo.
func NewSqlitePeerDebtRepo(db *sql.DB) *SqlitePeerDebtRepo {
	return &SqlitePeerDebtRepo{db: db}
}

func (r *SqlitePeerDebtRepo) Insert(d PeerDebt) error {
	var totalInstallments interface{}
	if d.TotalInstallments != nil {
		totalInstallments = *d.TotalInstallments
	}
	var frequency interface{}
	if d.Frequency != nil {
		frequency = *d.Frequency
	}
	var anchorDate interface{}
	if d.AnchorDate != nil {
		anchorDate = *d.AnchorDate
	}
	_, err := r.db.Exec(
		`INSERT INTO PeerDebt (id, account_id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.ID.String(), d.AccountID.String(), d.FriendID.String(), d.Amount, d.Description, d.Date,
		d.IsInstallment, totalInstallments, d.PaidInstallments, frequency, anchorDate, d.IsConfirmed,
	)
	if err != nil {
		return fmt.Errorf("peer_debt.Insert: %w", err)
	}
	return nil
}

func scanPeerDebt(idStr, accountIDStr, friendIDStr string, totalInstallments sql.NullInt64, frequency, anchorDate sql.NullString, d *PeerDebt) error {
	var err error
	d.ID, err = uuid.Parse(idStr)
	if err != nil {
		return fmt.Errorf("parse id uuid: %w", err)
	}
	d.AccountID, err = uuid.Parse(accountIDStr)
	if err != nil {
		return fmt.Errorf("parse account_id uuid: %w", err)
	}
	d.FriendID, err = uuid.Parse(friendIDStr)
	if err != nil {
		return fmt.Errorf("parse friend_id uuid: %w", err)
	}
	if totalInstallments.Valid {
		d.TotalInstallments = &totalInstallments.Int64
	}
	if frequency.Valid {
		d.Frequency = &frequency.String
	}
	if anchorDate.Valid {
		d.AnchorDate = &anchorDate.String
	}
	return nil
}

func (r *SqlitePeerDebtRepo) GetByFriend(friendID uuid.UUID, accountID *uuid.UUID) ([]PeerDebt, error) {
	query := `SELECT id, account_id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed
		 FROM PeerDebt WHERE friend_id = ?`
	args := []any{friendID.String()}
	if accountID != nil {
		query += ` AND account_id = ?`
		args = append(args, accountID.String())
	}
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("peer_debt.GetByFriend: query: %w", err)
	}
	defer rows.Close()
	return scanPeerDebts(rows)
}

func (r *SqlitePeerDebtRepo) GetAll(accountID *uuid.UUID) ([]PeerDebt, error) {
	query := `SELECT id, account_id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed
		 FROM PeerDebt`
	args := []any{}
	if accountID != nil {
		query += ` WHERE account_id = ?`
		args = append(args, accountID.String())
	}
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("peer_debt.GetAll: query: %w", err)
	}
	defer rows.Close()
	return scanPeerDebts(rows)
}

func scanPeerDebts(rows *sql.Rows) ([]PeerDebt, error) {
	var debts []PeerDebt
	for rows.Next() {
		var d PeerDebt
		var idStr, accountIDStr, friendIDStr string
		var totalInstallments sql.NullInt64
		var frequency, anchorDate sql.NullString
		if err := rows.Scan(
			&idStr, &accountIDStr, &friendIDStr, &d.Amount, &d.Description, &d.Date, &d.IsInstallment,
			&totalInstallments, &d.PaidInstallments, &frequency, &anchorDate, &d.IsConfirmed,
		); err != nil {
			return nil, fmt.Errorf("peer_debt: scan: %w", err)
		}
		if err := scanPeerDebt(idStr, accountIDStr, friendIDStr, totalInstallments, frequency, anchorDate, &d); err != nil {
			return nil, fmt.Errorf("peer_debt: %w", err)
		}
		debts = append(debts, d)
	}
	return debts, rows.Err()
}

func (r *SqlitePeerDebtRepo) GetByID(id uuid.UUID) (PeerDebt, error) {
	var d PeerDebt
	var idStr, accountIDStr, friendIDStr string
	var totalInstallments sql.NullInt64
	var frequency, anchorDate sql.NullString
	err := r.db.QueryRow(
		`SELECT id, account_id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed
		 FROM PeerDebt WHERE id = ?`,
		id.String(),
	).Scan(
		&idStr, &accountIDStr, &friendIDStr, &d.Amount, &d.Description, &d.Date, &d.IsInstallment,
		&totalInstallments, &d.PaidInstallments, &frequency, &anchorDate, &d.IsConfirmed,
	)
	if err != nil {
		return d, fmt.Errorf("peer_debt.GetByID: %w", err)
	}
	if err := scanPeerDebt(idStr, accountIDStr, friendIDStr, totalInstallments, frequency, anchorDate, &d); err != nil {
		return d, fmt.Errorf("peer_debt.GetByID: %w", err)
	}
	return d, nil
}

func (r *SqlitePeerDebtRepo) Update(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error {
	type updateField struct {
		col string
		val any
	}

	fields := make([]updateField, 0, 4)
	if amount != nil {
		fields = append(fields, updateField{col: "amount", val: *amount})
	}
	if description != nil {
		fields = append(fields, updateField{col: "description", val: *description})
	}
	if isConfirmed != nil {
		fields = append(fields, updateField{col: "is_confirmed", val: *isConfirmed})
	}
	if paidInstallments != nil {
		fields = append(fields, updateField{col: "paid_installments", val: *paidInstallments})
	}
	if len(fields) == 0 {
		return fmt.Errorf("peer_debt.Update: no fields provided")
	}

	setClauses := make([]string, 0, len(fields))
	args := make([]any, 0, len(fields)+1)
	for _, f := range fields {
		setClauses = append(setClauses, f.col+" = ?")
		args = append(args, f.val)
	}
	args = append(args, id.String())

	query := "UPDATE PeerDebt SET " + strings.Join(setClauses, ", ") + " WHERE id = ?"
	res, err := r.db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("peer_debt.Update: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("peer_debt.Update: %w", sql.ErrNoRows)
	}
	return nil
}

func (r *SqlitePeerDebtRepo) DeleteByID(id uuid.UUID) error {
	if _, err := r.db.Exec(`DELETE FROM PeerDebt WHERE id = ?`, id.String()); err != nil {
		return fmt.Errorf("peer_debt.DeleteByID: %w", err)
	}
	return nil
}

func (r *SqlitePeerDebtRepo) GetBalanceByFriend(friendID uuid.UUID, accountID *uuid.UUID) (PeerDebtBalance, error) {
	query := `SELECT
		    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
		    COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
		 FROM PeerDebt WHERE friend_id = ?
		   AND (
		     (is_installment = 1 AND paid_installments < total_installments)
		     OR
		     (is_installment = 0 AND is_confirmed = 0)
		   )`
	args := []any{friendID.String()}
	if accountID != nil {
		query += ` AND account_id = ?`
		args = append(args, accountID.String())
	}

	var b PeerDebtBalance
	err := r.db.QueryRow(query, args...).Scan(&b.FriendOwesUser, &b.UserOwesFriend)
	if err != nil {
		return b, fmt.Errorf("peer_debt.GetBalanceByFriend: %w", err)
	}
	b.Net = b.FriendOwesUser - b.UserOwesFriend
	return b, nil
}

func (r *SqlitePeerDebtRepo) GetGlobalBalance(accountID *uuid.UUID) (GlobalPeerBalance, error) {
	query := `SELECT
		    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
		    COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
		 FROM PeerDebt
		 WHERE (
		   (is_installment = 1 AND paid_installments < total_installments)
		   OR
		   (is_installment = 0 AND is_confirmed = 0)
		 )`
	args := []any{}
	if accountID != nil {
		query += ` AND account_id = ?`
		args = append(args, accountID.String())
	}

	var b GlobalPeerBalance
	err := r.db.QueryRow(query, args...).Scan(&b.TotalOwedToUser, &b.TotalUserOwes)
	if err != nil {
		return b, fmt.Errorf("peer_debt.GetGlobalBalance: %w", err)
	}
	b.Net = b.TotalOwedToUser - b.TotalUserOwes
	return b, nil
}

// ConfirmInstallment atomically confirms a debt record.
// For installment debts: increments paid_installments by 1, capped at total_installments.
// For non-installment debts: sets is_confirmed = 1.
// Uses a single atomic SQL statement — no read-modify-write race.
func (r *SqlitePeerDebtRepo) ConfirmInstallment(id uuid.UUID) error {
	res, err := r.db.Exec(`
		UPDATE PeerDebt SET
		    paid_installments = CASE WHEN is_installment = 1
		        THEN MIN(paid_installments + 1, COALESCE(total_installments, paid_installments + 1))
		        ELSE paid_installments END,
		    is_confirmed = CASE WHEN is_installment = 0 THEN 1 ELSE is_confirmed END
		WHERE id = ?`, id.String())
	if err != nil {
		return fmt.Errorf("peer_debt.ConfirmInstallment: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("peer_debt.ConfirmInstallment: %w", sql.ErrNoRows)
	}
	return nil
}

func (r *SqlitePeerDebtRepo) SumNextUserPayment(accountID *uuid.UUID) (int64, error) {
	query := `
		SELECT COALESCE(ABS(SUM(
			CASE
				WHEN is_installment = 1 AND total_installments > 0
					THEN amount / total_installments
				ELSE amount
			END
		)), 0)
		FROM PeerDebt
		WHERE amount < 0
		  AND (
		    (is_installment = 1 AND paid_installments < total_installments)
		    OR
		    (is_installment = 0 AND is_confirmed = 0)
		  )`
	args := []any{}
	if accountID != nil {
		query += ` AND account_id = ?`
		args = append(args, accountID.String())
	}

	var sum int64
	err := r.db.QueryRow(query, args...).Scan(&sum)
	if err != nil {
		return 0, fmt.Errorf("peer_debt.SumNextUserPayment: %w", err)
	}
	return sum, nil
}

func (r *SqlitePeerDebtRepo) GetActiveUserDebtsWithFriend(accountID *uuid.UUID) ([]ActiveUserDebt, error) {
	query := `
		SELECT f.name, pd.amount, pd.is_installment,
		       COALESCE(pd.total_installments, 0),
		       pd.paid_installments,
		       COALESCE(pd.frequency, ''),
		       pd.date,
		       pd.anchor_date
		FROM PeerDebt pd
		JOIN Friend f ON f.id = pd.friend_id
		WHERE pd.amount < 0
		  AND (
		    (pd.is_installment = 1 AND pd.paid_installments < pd.total_installments)
		    OR
		    (pd.is_installment = 0 AND pd.is_confirmed = 0)
		  )`
	args := []any{}
	if accountID != nil {
		query += ` AND pd.account_id = ?`
		args = append(args, accountID.String())
	}
	query += ` ORDER BY f.name, pd.date`

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("peer_debt.GetActiveUserDebtsWithFriend: query: %w", err)
	}
	defer rows.Close()

	var result []ActiveUserDebt
	for rows.Next() {
		var d ActiveUserDebt
		var anchorDate sql.NullString
		if err := rows.Scan(
			&d.FriendName, &d.Amount, &d.IsInstallment,
			&d.TotalInstallments, &d.PaidInstallments,
			&d.Frequency, &d.Date, &anchorDate,
		); err != nil {
			return nil, fmt.Errorf("peer_debt.GetActiveUserDebtsWithFriend: scan: %w", err)
		}
		if anchorDate.Valid {
			d.AnchorDate = &anchorDate.String
		}
		result = append(result, d)
	}
	return result, rows.Err()
}

func (r *SqlitePeerDebtRepo) SumUpcomingPeerObligations(accountID *uuid.UUID, after, onOrBefore time.Time) (int64, error) {
	afterStr := after.UTC().Format(time.RFC3339)
	onOrBeforeStr := onOrBefore.UTC().Format(time.RFC3339)

	lumpQuery := `SELECT COALESCE(SUM(amount), 0) FROM PeerDebt
		 WHERE amount < 0 AND is_installment = 0 AND is_confirmed = 0
		   AND date > ? AND date < ?`
	lumpArgs := []any{afterStr, onOrBeforeStr}
	if accountID != nil {
		lumpQuery += ` AND account_id = ?`
		lumpArgs = append(lumpArgs, accountID.String())
	}

	var lumpSum int64
	if err := r.db.QueryRow(lumpQuery, lumpArgs...).Scan(&lumpSum); err != nil {
		return 0, fmt.Errorf("peer_debt.SumUpcomingPeerObligations: lump sum: %w", err)
	}

	instQuery := `SELECT id, amount, total_installments, paid_installments, frequency, date
		 FROM PeerDebt
		 WHERE amount < 0
		   AND is_installment = 1
		   AND total_installments IS NOT NULL
		   AND total_installments > 0
		   AND paid_installments < total_installments`
	instArgs := []any{}
	if accountID != nil {
		instQuery += ` AND account_id = ?`
		instArgs = append(instArgs, accountID.String())
	}

	rows, err := r.db.Query(instQuery, instArgs...)
	if err != nil {
		return 0, fmt.Errorf("peer_debt.SumUpcomingPeerObligations: query: %w", err)
	}
	defer rows.Close()

	var totalInstallmentSum int64
	for rows.Next() {
		var id string
		var amount, totalInst, paidInst int64
		var freq string
		var dateStr string
		if err := rows.Scan(&id, &amount, &totalInst, &paidInst, &freq, &dateStr); err != nil {
			return 0, fmt.Errorf("peer_debt.SumUpcomingPeerObligations: scan: %w", err)
		}

		instPayment := amount / totalInst

		firstDue, err := time.Parse(time.RFC3339, dateStr)
		if err != nil {
			continue
		}

		nextDue := engine.NextInstallmentDue(firstDue, paidInst, freq)

		if nextDue.After(after) && nextDue.Before(onOrBefore) {
			totalInstallmentSum += instPayment
		}
	}

	return lumpSum + totalInstallmentSum, nil
}
