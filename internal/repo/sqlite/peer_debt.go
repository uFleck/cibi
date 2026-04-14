package sqlite

import (
	"database/sql"
	"fmt"
	"math"

	"github.com/google/uuid"
)

// PeerDebt represents a debt record between the user and a friend.
// Amount: positive = friend owes user, negative = user owes friend (in cents).
type PeerDebt struct {
	ID                uuid.UUID
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

// PeerDebtRepo defines the data access contract for peer debts.
type PeerDebtRepo interface {
	Insert(d PeerDebt) error
	GetByFriend(friendID uuid.UUID) ([]PeerDebt, error)
	GetAll() ([]PeerDebt, error)
	GetByID(id uuid.UUID) (PeerDebt, error)
	Update(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error
	DeleteByID(id uuid.UUID) error
	GetBalanceByFriend(friendID uuid.UUID) (PeerDebtBalance, error)
	GetGlobalBalance() (GlobalPeerBalance, error)
	SumUpcomingPeerObligations() (int64, error)
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
		`INSERT INTO PeerDebt (id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.ID.String(), d.FriendID.String(), d.Amount, d.Description, d.Date,
		d.IsInstallment, totalInstallments, d.PaidInstallments, frequency, anchorDate, d.IsConfirmed,
	)
	if err != nil {
		return fmt.Errorf("peer_debt.Insert: %w", err)
	}
	return nil
}

func scanPeerDebt(idStr, friendIDStr string, totalInstallments sql.NullInt64, frequency, anchorDate sql.NullString, d *PeerDebt) error {
	var err error
	d.ID, err = uuid.Parse(idStr)
	if err != nil {
		return fmt.Errorf("parse id uuid: %w", err)
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

func (r *SqlitePeerDebtRepo) GetByFriend(friendID uuid.UUID) ([]PeerDebt, error) {
	rows, err := r.db.Query(
		`SELECT id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed
		 FROM PeerDebt WHERE friend_id = ?`,
		friendID.String(),
	)
	if err != nil {
		return nil, fmt.Errorf("peer_debt.GetByFriend: query: %w", err)
	}
	defer rows.Close()
	return scanPeerDebts(rows)
}

func (r *SqlitePeerDebtRepo) GetAll() ([]PeerDebt, error) {
	rows, err := r.db.Query(
		`SELECT id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed
		 FROM PeerDebt`,
	)
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
		var idStr, friendIDStr string
		var totalInstallments sql.NullInt64
		var frequency, anchorDate sql.NullString
		if err := rows.Scan(
			&idStr, &friendIDStr, &d.Amount, &d.Description, &d.Date, &d.IsInstallment,
			&totalInstallments, &d.PaidInstallments, &frequency, &anchorDate, &d.IsConfirmed,
		); err != nil {
			return nil, fmt.Errorf("peer_debt: scan: %w", err)
		}
		if err := scanPeerDebt(idStr, friendIDStr, totalInstallments, frequency, anchorDate, &d); err != nil {
			return nil, fmt.Errorf("peer_debt: %w", err)
		}
		debts = append(debts, d)
	}
	return debts, rows.Err()
}

func (r *SqlitePeerDebtRepo) GetByID(id uuid.UUID) (PeerDebt, error) {
	var d PeerDebt
	var idStr, friendIDStr string
	var totalInstallments sql.NullInt64
	var frequency, anchorDate sql.NullString
	err := r.db.QueryRow(
		`SELECT id, friend_id, amount, description, date, is_installment,
		 total_installments, paid_installments, frequency, anchor_date, is_confirmed
		 FROM PeerDebt WHERE id = ?`,
		id.String(),
	).Scan(
		&idStr, &friendIDStr, &d.Amount, &d.Description, &d.Date, &d.IsInstallment,
		&totalInstallments, &d.PaidInstallments, &frequency, &anchorDate, &d.IsConfirmed,
	)
	if err != nil {
		return d, fmt.Errorf("peer_debt.GetByID: %w", err)
	}
	if err := scanPeerDebt(idStr, friendIDStr, totalInstallments, frequency, anchorDate, &d); err != nil {
		return d, fmt.Errorf("peer_debt.GetByID: %w", err)
	}
	return d, nil
}

func (r *SqlitePeerDebtRepo) Update(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("peer_debt.Update: begin: %w", err)
	}
	defer tx.Rollback()
	// Track whether at least one field was updated and the row exists.
	rowChecked := false
	if amount != nil {
		res, err := tx.Exec(`UPDATE PeerDebt SET amount = ? WHERE id = ?`, *amount, id.String())
		if err != nil {
			return fmt.Errorf("peer_debt.Update: amount: %w", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("peer_debt.Update: %w", sql.ErrNoRows)
		}
		rowChecked = true
	}
	if description != nil {
		res, err := tx.Exec(`UPDATE PeerDebt SET description = ? WHERE id = ?`, *description, id.String())
		if err != nil {
			return fmt.Errorf("peer_debt.Update: description: %w", err)
		}
		if !rowChecked {
			if n, _ := res.RowsAffected(); n == 0 {
				return fmt.Errorf("peer_debt.Update: %w", sql.ErrNoRows)
			}
			rowChecked = true
		}
	}
	if isConfirmed != nil {
		res, err := tx.Exec(`UPDATE PeerDebt SET is_confirmed = ? WHERE id = ?`, *isConfirmed, id.String())
		if err != nil {
			return fmt.Errorf("peer_debt.Update: is_confirmed: %w", err)
		}
		if !rowChecked {
			if n, _ := res.RowsAffected(); n == 0 {
				return fmt.Errorf("peer_debt.Update: %w", sql.ErrNoRows)
			}
			rowChecked = true
		}
	}
	if paidInstallments != nil {
		res, err := tx.Exec(`UPDATE PeerDebt SET paid_installments = ? WHERE id = ?`, *paidInstallments, id.String())
		if err != nil {
			return fmt.Errorf("peer_debt.Update: paid_installments: %w", err)
		}
		if !rowChecked {
			if n, _ := res.RowsAffected(); n == 0 {
				return fmt.Errorf("peer_debt.Update: %w", sql.ErrNoRows)
			}
		}
	}
	return tx.Commit()
}

func (r *SqlitePeerDebtRepo) DeleteByID(id uuid.UUID) error {
	if _, err := r.db.Exec(`DELETE FROM PeerDebt WHERE id = ?`, id.String()); err != nil {
		return fmt.Errorf("peer_debt.DeleteByID: %w", err)
	}
	return nil
}

func (r *SqlitePeerDebtRepo) GetBalanceByFriend(friendID uuid.UUID) (PeerDebtBalance, error) {
	var b PeerDebtBalance
	err := r.db.QueryRow(
		`SELECT
		    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
		    COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
		 FROM PeerDebt WHERE friend_id = ?`,
		friendID.String(),
	).Scan(&b.FriendOwesUser, &b.UserOwesFriend)
	if err != nil {
		return b, fmt.Errorf("peer_debt.GetBalanceByFriend: %w", err)
	}
	b.Net = b.FriendOwesUser - b.UserOwesFriend
	return b, nil
}

func (r *SqlitePeerDebtRepo) GetGlobalBalance() (GlobalPeerBalance, error) {
	var b GlobalPeerBalance
	err := r.db.QueryRow(
		`SELECT
		    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
		    COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0)
		 FROM PeerDebt`,
	).Scan(&b.TotalOwedToUser, &b.TotalUserOwes)
	if err != nil {
		return b, fmt.Errorf("peer_debt.GetGlobalBalance: %w", err)
	}
	b.Net = b.TotalOwedToUser - b.TotalUserOwes
	return b, nil
}

func (r *SqlitePeerDebtRepo) SumUpcomingPeerObligations() (int64, error) {
	// Unconfirmed lump-sum debts (user owes friend, amount < 0, not installment, not confirmed)
	var lumpSum int64
	if err := r.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM PeerDebt
		 WHERE amount < 0 AND is_installment = 0 AND is_confirmed = 0`,
	).Scan(&lumpSum); err != nil {
		return 0, fmt.Errorf("peer_debt.SumUpcomingPeerObligations: lump sum: %w", err)
	}

	// Active installment debts — one payment per active debt (cast to REAL to avoid integer division)
	var installmentSum float64
	if err := r.db.QueryRow(
		`SELECT COALESCE(SUM(CAST(amount AS REAL) / total_installments), 0) FROM PeerDebt
		 WHERE amount < 0
		   AND is_installment = 1
		   AND total_installments IS NOT NULL
		   AND total_installments > 0
		   AND paid_installments < total_installments`,
	).Scan(&installmentSum); err != nil {
		return 0, fmt.Errorf("peer_debt.SumUpcomingPeerObligations: installment sum: %w", err)
	}

	return lumpSum + int64(math.Round(installmentSum)), nil
}
