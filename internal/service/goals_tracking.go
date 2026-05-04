package service

import (
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

type GoalsTrackingResponse struct {
	Summary        GoalsTrackingSummary    `json:"summary"`
	TopGoals       []GoalsTrackingGoal     `json:"top_goals"`
	RecentActivity []GoalsTrackingActivity `json:"recent_activity"`
	UpdatedAtUTC   string                  `json:"updated_at_utc"`
}

type GoalsTrackingSummary struct {
	GoalsCount     int     `json:"goals_count"`
	CompletedCount int     `json:"completed_count"`
	TotalTarget    float64 `json:"total_target"`
	TotalInvested  float64 `json:"total_invested"`
	TotalRemaining float64 `json:"total_remaining"`
}

type GoalsTrackingGoal struct {
	ID                           string  `json:"id"`
	Name                         string  `json:"name"`
	Status                       string  `json:"status"`
	TargetAmount                 float64 `json:"target_amount"`
	InvestedTotal                float64 `json:"invested_total"`
	RemainingAmount              float64 `json:"remaining_amount"`
	ProgressPct                  float64 `json:"progress_pct"`
	MinContributionPerWindow     float64 `json:"min_contribution_per_window"`
	TargetDateUTC                *string `json:"target_date_utc"`
	CreatedAtUTC                 string  `json:"created_at_utc"`
}

type GoalsTrackingActivity struct {
	GoalID       string  `json:"goal_id"`
	GoalName     string  `json:"goal_name"`
	EntryID      string  `json:"entry_id"`
	Amount       float64 `json:"amount"`
	Type         string  `json:"type"`
	Source       string  `json:"source"`
	TimestampUTC string  `json:"timestamp_utc"`
}

type urgencyRankedGoal struct {
	goal           sqlite.Goal
	remainingCents int64
	score          int64
}

func (s *GoalsService) BuildTracking(accountID uuid.UUID) (GoalsTrackingResponse, error) {
	goals, err := s.goals.GetGoalsByAccount(accountID)
	if err != nil {
		return GoalsTrackingResponse{}, err
	}
	now := time.Now().UTC()
	resp := GoalsTrackingResponse{UpdatedAtUTC: now.Format(time.RFC3339)}

	ranked := make([]urgencyRankedGoal, 0, len(goals))
	activities := make([]GoalsTrackingActivity, 0)
	for _, g := range goals {
		remaining := g.TargetAmountCents - g.InvestedTotalCents
		if remaining < 0 {
			remaining = 0
		}
		resp.Summary.GoalsCount++
		if g.Status == "completed" {
			resp.Summary.CompletedCount++
		}
		resp.Summary.TotalTarget += float64(g.TargetAmountCents) / 100
		resp.Summary.TotalInvested += float64(g.InvestedTotalCents) / 100
		resp.Summary.TotalRemaining += float64(remaining) / 100

		ranked = append(ranked, urgencyRankedGoal{goal: g, remainingCents: remaining, score: urgencyScore(now, g, remaining)})

		entries, err := s.goals.ListLedgerByGoal(g.ID)
		if err != nil {
			return GoalsTrackingResponse{}, err
		}
		for _, e := range entries {
			activities = append(activities, GoalsTrackingActivity{
				GoalID:       g.ID.String(),
				GoalName:     g.Name,
				EntryID:      e.ID.String(),
				Amount:       float64(e.AmountCents) / 100,
				Type:         e.Type,
				Source:       e.Source,
				TimestampUTC: e.TimestampUTC.UTC().Format(time.RFC3339),
			})
		}
	}

	// SortStable behavior required by plan: deterministic order across ties.
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		it := ranked[i].goal.TargetDateUTC
		jt := ranked[j].goal.TargetDateUTC
		switch {
		case it != nil && jt == nil:
			return true
		case it == nil && jt != nil:
			return false
		case it != nil && jt != nil && !it.Equal(*jt):
			return it.Before(*jt)
		}
		return ranked[i].goal.CreatedAtUTC.Before(ranked[j].goal.CreatedAtUTC)
	})

	limit := 5
	if len(ranked) < limit {
		limit = len(ranked)
	}
	resp.TopGoals = make([]GoalsTrackingGoal, 0, limit)
	for _, rg := range ranked[:limit] {
		var td *string
		if rg.goal.TargetDateUTC != nil {
			s := rg.goal.TargetDateUTC.UTC().Format(time.RFC3339)
			td = &s
		}
		progress := 0.0
		if rg.goal.TargetAmountCents > 0 {
			progress = (float64(rg.goal.InvestedTotalCents) / float64(rg.goal.TargetAmountCents)) * 100
			if progress > 100 {
				progress = 100
			}
		}
		resp.TopGoals = append(resp.TopGoals, GoalsTrackingGoal{
			ID:                        rg.goal.ID.String(),
			Name:                      rg.goal.Name,
			Status:                    rg.goal.Status,
			TargetAmount:              float64(rg.goal.TargetAmountCents) / 100,
			InvestedTotal:             float64(rg.goal.InvestedTotalCents) / 100,
			RemainingAmount:           float64(rg.remainingCents) / 100,
			ProgressPct:               progress,
			MinContributionPerWindow:  float64(rg.goal.MinContributionPerWindowCents) / 100,
			TargetDateUTC:             td,
			CreatedAtUTC:              rg.goal.CreatedAtUTC.UTC().Format(time.RFC3339),
		})
	}

	sort.SliceStable(activities, func(i, j int) bool {
		return activities[i].TimestampUTC > activities[j].TimestampUTC
	})
	if len(activities) > 10 {
		activities = activities[:10]
	}
	resp.RecentActivity = activities
	return resp, nil
}

func urgencyScore(now time.Time, g sqlite.Goal, remainingCents int64) int64 {
	days := int64(36500)
	if g.TargetDateUTC != nil {
		d := int64(g.TargetDateUTC.UTC().Sub(now).Hours() / 24)
		if d < 0 {
			d = 0
		}
		days = d
	}
	// nearer date -> higher; larger remaining -> higher.
	return (36500-days)*1_000_000 + remainingCents
}
