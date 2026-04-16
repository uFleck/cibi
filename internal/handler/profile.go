package handler

import (
	"net/http"

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
}

type PatchProfileRequest struct {
	DisplayName string  `json:"display_name" validate:"required"`
	PixKey      *string `json:"pix_key"`
}

func (h *ProfileHandler) Get(c echo.Context) error {
	p, err := h.svc.Get()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, ProfileResponse{DisplayName: p.DisplayName, PixKey: p.PixKey})
}

func (h *ProfileHandler) Patch(c echo.Context) error {
	var req PatchProfileRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := c.Validate(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.svc.Update(req.DisplayName, req.PixKey); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
