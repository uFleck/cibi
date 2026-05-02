package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

type ProfileHandler struct {
	svc *service.ProfileService
}

func NewProfileHandler(svc *service.ProfileService) *ProfileHandler {
	return &ProfileHandler{svc: svc}
}

type ProfileResponse struct {
	DisplayName string  `json:"display_name"`
	PixKey      *string `json:"pix_key"`
	Theme       string  `json:"theme"`
}

type PatchProfileRequest struct {
	DisplayName string  `json:"display_name" validate:"required"`
	PixKey      *string `json:"pix_key"`
	Theme       string  `json:"theme" validate:"required"`
}

func (h *ProfileHandler) Get(c echo.Context) error {
	accountID, err := uuid.Parse(c.QueryParam("account_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	p, err := h.svc.GetByAccount(accountID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, ProfileResponse{
		DisplayName: p.DisplayName,
		PixKey:      p.PixKey,
		Theme:       p.Theme,
	})
}

func (h *ProfileHandler) Patch(c echo.Context) error {
	accountID, err := uuid.Parse(c.QueryParam("account_id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid account_id")
	}
	var req PatchProfileRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.svc.UpdateByAccount(accountID, req.DisplayName, req.PixKey, req.Theme); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
