package handler

import (
	"math"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

// EngineServiceIface defines the service contract used by CheckHandler.
type EngineServiceIface interface {
	CanIBuyIt(accountID uuid.UUID, itemPrice int64) (service.EngineResult, error)
	CanIBuyItDefault(itemPrice int64) (service.EngineResult, error)
}

// Ensure *service.EngineService satisfies EngineServiceIface.
var _ EngineServiceIface = (*service.EngineService)(nil)

// CheckHandler handles HTTP requests for /check routes.
type CheckHandler struct {
	svc EngineServiceIface
}

// NewCheckHandler creates a CheckHandler wired to the given service.
func NewCheckHandler(svc *service.EngineService) *CheckHandler {
	return &CheckHandler{svc: svc}
}

// CheckRequest is the request body for POST /check.
type CheckRequest struct {
	Amount    float64 `json:"amount" validate:"required,gt=0"`
	AccountID *string `json:"account_id"`
}

// CheckResponse is the response body for POST /check.
type CheckResponse struct {
	CanBuy                bool                     `json:"can_buy"`
	PurchasingPower       float64                  `json:"purchasing_power"` // dollars
	BufferRemaining       float64                  `json:"buffer_remaining"` // dollars
	RiskLevel             string                   `json:"risk_level"`
	WillAffordAfterPayday bool                     `json:"will_afford_after_payday"`
	WaitUntil             *string                  `json:"wait_until"` // RFC3339 date or null
	GoalImpacts           []CheckGoalImpact        `json:"goal_impacts"`
	GoalsCoveredThisWindow []CheckGoalWindowCoverage `json:"goals_covered_this_window"`
}

type CheckGoalImpact struct {
	GoalID                   string  `json:"goal_id"`
	GoalName                 string  `json:"goal_name"`
	RemainingBefore          float64 `json:"remaining_before"`
	RemainingAfter           float64 `json:"remaining_after"`
	ProgressBeforePct        float64 `json:"progress_before_pct"`
	ProgressAfterPct         float64 `json:"progress_after_pct"`
	MinContributionPerWindow float64 `json:"min_contribution_per_window"`
	Severity                 string  `json:"severity"`
}

type CheckGoalWindowCoverage struct {
	GoalID                       string  `json:"goal_id"`
	GoalName                     string  `json:"goal_name"`
	ContributedThisWindow        float64 `json:"contributed_this_window"`
	MinContributionPerWindow     float64 `json:"min_contribution_per_window"`
}

// Check handles POST /check — answers whether a purchase is affordable.
func (h *CheckHandler) Check(c echo.Context) error {
	var req CheckRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	cents := int64(math.Round(req.Amount * 100))

	var result service.EngineResult
	var err error
	if req.AccountID != nil && *req.AccountID != "" {
		accountID, parseErr := uuid.Parse(*req.AccountID)
		if parseErr != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
		}
		result, err = h.svc.CanIBuyIt(accountID, cents)
	} else {
		result, err = h.svc.CanIBuyItDefault(cents)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	impacts := make([]CheckGoalImpact, 0, len(result.GoalImpacts))
	for _, impact := range result.GoalImpacts {
		impacts = append(impacts, CheckGoalImpact{
			GoalID:            impact.GoalID.String(),
			GoalName:          impact.GoalName,
			RemainingBefore:   float64(impact.RemainingBefore) / 100.0,
			RemainingAfter:    float64(impact.RemainingAfter) / 100.0,
			ProgressBeforePct: impact.ProgressBeforePct,
			ProgressAfterPct:  impact.ProgressAfterPct,
			MinContributionPerWindow: float64(impact.MinContributionPerWindowCents) / 100.0,
			Severity:          impact.Severity,
		})
	}
	covered := make([]CheckGoalWindowCoverage, 0, len(result.GoalsCoveredThisWindow))
	for _, goal := range result.GoalsCoveredThisWindow {
		covered = append(covered, CheckGoalWindowCoverage{
			GoalID:                   goal.GoalID.String(),
			GoalName:                 goal.GoalName,
			ContributedThisWindow:    float64(goal.ContributedThisWindowCents) / 100.0,
			MinContributionPerWindow: float64(goal.MinContributionPerWindowCents) / 100.0,
		})
	}
	resp := CheckResponse{
		CanBuy:                 result.CanBuy,
		PurchasingPower:        float64(result.PurchasingPower) / 100.0,
		BufferRemaining:        float64(result.BufferRemaining) / 100.0,
		RiskLevel:              result.RiskLevel,
		WillAffordAfterPayday:  result.WillAffordAfterPayday,
		GoalImpacts:            impacts,
		GoalsCoveredThisWindow: covered,
	}
	if result.WaitUntil != nil {
		s := result.WaitUntil.Format("2006-01-02")
		resp.WaitUntil = &s
	}
	return c.JSON(http.StatusOK, resp)
}
