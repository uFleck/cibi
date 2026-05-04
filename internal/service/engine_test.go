package service

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

func TestBuildGoalImpacts_UsesMinContributionThreshold(t *testing.T) {
	goals := []sqlite.Goal{
		{ID: uuid.New(), Name: "Laptop", Status: "active", TargetAmountCents: 100000, InvestedTotalCents: 20000, MinContributionPerWindowCents: 5000},
		{ID: uuid.New(), Name: "Trip", Status: "active", TargetAmountCents: 30000, InvestedTotalCents: 25000, MinContributionPerWindowCents: 0},
		{ID: uuid.New(), Name: "Done", Status: "completed", TargetAmountCents: 10000, InvestedTotalCents: 10000, MinContributionPerWindowCents: 3000},
	}

	impacts, covered := buildGoalImpacts(goals, 9000, 3000, map[uuid.UUID]int64{})
	if len(covered) != 0 {
		t.Fatalf("expected no covered goals, got %d", len(covered))
	}
	if len(impacts) != 1 {
		t.Fatalf("expected 1 impact, got %d", len(impacts))
	}
	if impacts[0].GoalName != "Laptop" {
		t.Fatalf("expected Laptop goal, got %s", impacts[0].GoalName)
	}
	if impacts[0].RemainingBefore != 80000 || impacts[0].RemainingAfter != 80000 {
		t.Fatalf("goal remaining should not be decremented by check projection: %+v", impacts[0])
	}
	if impacts[0].ProgressBeforePct != impacts[0].ProgressAfterPct {
		t.Fatalf("progress should remain unchanged in projection")
	}
}

func TestBuildGoalImpacts_SkipsGoalWhenWindowMinAlreadyMet(t *testing.T) {
	goalID := uuid.New()
	goals := []sqlite.Goal{{ID: goalID, Name: "Emergency", Status: "active", TargetAmountCents: 100000, InvestedTotalCents: 10000, MinContributionPerWindowCents: 5000}}

	impacts, covered := buildGoalImpacts(goals, 9000, 1000, map[uuid.UUID]int64{goalID: 5000})
	if len(impacts) != 0 {
		t.Fatalf("expected no impact once current window min is already contributed, got %d", len(impacts))
	}
	if len(covered) != 1 {
		t.Fatalf("expected one covered goal, got %d", len(covered))
	}
	if covered[0].GoalID != goalID {
		t.Fatalf("unexpected covered goal id: %s", covered[0].GoalID)
	}
	if covered[0].ContributedThisWindowCents != 5000 {
		t.Fatalf("unexpected covered amount: %d", covered[0].ContributedThisWindowCents)
	}
	if covered[0].MinContributionPerWindowCents != 5000 {
		t.Fatalf("unexpected min contribution: %d", covered[0].MinContributionPerWindowCents)
	}
}

func TestEngineResult_WAITSupportsImpactPayload(t *testing.T) {
	wait := time.Now().UTC().Add(24 * time.Hour)
	result := EngineResult{
		RiskLevel:             "WAIT",
		WillAffordAfterPayday: true,
		WaitUntil:             &wait,
		GoalImpacts: []GoalImpact{{
			GoalID:            uuid.New(),
			GoalName:          "Emergency Fund",
			RemainingBefore:   50000,
			RemainingAfter:    40000,
			ProgressBeforePct: 50,
			ProgressAfterPct:  60,
			Severity:          "medium",
		}},
	}

	if result.RiskLevel != "WAIT" || !result.WillAffordAfterPayday || result.WaitUntil == nil {
		t.Fatalf("invalid WAIT result: %+v", result)
	}
	if len(result.GoalImpacts) != 1 {
		t.Fatalf("expected goal impact payload in WAIT result")
	}
}
