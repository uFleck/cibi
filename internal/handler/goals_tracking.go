package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

func (h *GoalsHandler) Tracking(c echo.Context) error {
	accountID, err := uuid.Parse(c.QueryParam("account_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	tracking, err := h.svc.BuildTracking(accountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, tracking)
}
