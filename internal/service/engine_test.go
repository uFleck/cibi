package service

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

func TestBuildGoalImpacts_SeverityAndProjection(t *testing.T) {
	goals := []sqlite.Goal{
		{ID: uuid.New(), Name: "Laptop", Status: "active", TargetAmountCents: 100000, InvestedTotalCents: 20000},
		{ID: uuid.New(), Name: "Trip", Status: "active", TargetAmountCents: 30000, InvestedTotalCents: 25000},
		{ID: uuid.New(), Name: "Done", Status: "completed", TargetAmountCents: 10000, InvestedTotalCents: 10000},
	}

	impacts := buildGoalImpacts(goals, 10000)
	if len(impacts) != 2 {
		t.Fatalf("expected 2 impacts, got %d", len(impacts))
	}
	if impacts[0].Severity != "medium" {
		t.Fatalf("expected medium severity for first goal, got %s", impacts[0].Severity)
	}
	if impacts[1].Severity != "high" {
		t.Fatalf("expected high severity for second goal, got %s", impacts[1].Severity)
	}
	if impacts[0].RemainingBefore != 80000 || impacts[0].RemainingAfter != 70000 {
		t.Fatalf("unexpected remaining projection: %+v", impacts[0])
	}
	if impacts[0].ProgressBeforePct <= 0 || impacts[0].ProgressAfterPct <= impacts[0].ProgressBeforePct {
		t.Fatalf("expected progress increase, got before=%.2f after=%.2f", impacts[0].ProgressBeforePct, impacts[0].ProgressAfterPct)
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
