package service

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

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

type GoalRecurringDueItem struct {
	ID              string  `json:"id"`
	GoalID          string  `json:"goal_id"`
	GoalName        string  `json:"goal_name"`
	Amount          float64 `json:"amount"`
	Frequency       string  `json:"frequency"`
	AnchorDateUTC   string  `json:"anchor_date_utc"`
	NextDueUTC      string  `json:"next_due_utc"`
	IsOverdue       bool    `json:"is_overdue"`
	LastEntryID     *string `json:"last_entry_id"`
	LastPostedAtUTC *string `json:"last_posted_at_utc"`
}

func (s *GoalsService) ListRecurringDue(accountID uuid.UUID, now time.Time) ([]GoalRecurringDueItem, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	items, err := s.goals.ListRecurringByAccount(accountID)
	if err != nil {
		return nil, err
	}
	out := make([]GoalRecurringDueItem, 0, len(items))
	for _, item := range items {
		if !item.Active || item.NextDueUTC.After(now) {
			continue
		}
		goal, err := s.goals.GetGoalByID(item.GoalID)
		if err != nil {
			return nil, err
		}
		entries, err := s.goals.ListLedgerByGoal(item.GoalID)
		if err != nil {
			return nil, err
		}
		var lastID, lastAt *string
		for i := len(entries) - 1; i >= 0; i-- {
			e := entries[i]
			if e.Source != "recurring" {
				continue
			}
			id := e.ID.String()
			ts := e.TimestampUTC.UTC().Format(time.RFC3339)
			lastID, lastAt = &id, &ts
			break
		}
		out = append(out, GoalRecurringDueItem{
			ID:              item.ID.String(),
			GoalID:          item.GoalID.String(),
			GoalName:        goal.Name,
			Amount:          float64(item.AmountCents) / 100,
			Frequency:       item.Frequency,
			AnchorDateUTC:   item.AnchorDateUTC.UTC().Format(time.RFC3339),
			NextDueUTC:      item.NextDueUTC.UTC().Format(time.RFC3339),
			IsOverdue:       item.NextDueUTC.Before(now),
			LastEntryID:     lastID,
			LastPostedAtUTC: lastAt,
		})
	}
	return out, nil
}

func (s *GoalsService) ConfirmRecurringDue(itemID uuid.UUID, timestamp time.Time) error {
	item, err := s.goals.GetRecurringByID(itemID)
	if err != nil {
		return err
	}
	if !item.Active {
		return fmt.Errorf("recurring contribution is inactive")
	}
	if timestamp.IsZero() {
		timestamp = time.Now().UTC()
	}
	if timestamp.Before(item.NextDueUTC) {
		return fmt.Errorf("recurring contribution is not due yet")
	}
	source := "recurring"
	_, err = s.AddLedgerEntry(AddGoalLedgerInput{
		GoalID:       item.GoalID,
		Amount:       float64(item.AmountCents) / 100,
		Type:         "contribution",
		Source:       source,
		TimestampUTC: timestamp.UTC(),
	})
	if err != nil {
		return err
	}
	next := advanceFrequency(item.NextDueUTC, item.Frequency)
	now := time.Now().UTC()
	return s.goals.UpdateRecurring(item.ID, sqlite.UpdateGoalRecurringContribution{NextDueUTC: &next, UpdatedAtUTC: &now}, nil)
}

func advanceFrequency(base time.Time, frequency string) time.Time {
	switch frequency {
	case "weekly":
		return base.AddDate(0, 0, 7)
	case "bi-weekly":
		return base.AddDate(0, 0, 14)
	case "monthly":
		return base.AddDate(0, 1, 0)
	case "yearly":
		return base.AddDate(1, 0, 0)
	default:
		return base
	}
}
