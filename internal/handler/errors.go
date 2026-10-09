package handler

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

// CustomValidator wraps go-playground/validator for Echo's Validator interface.
// Register on echo instance: e.Validator = &CustomValidator{v: validator.New()}
type CustomValidator struct {
	v *validator.Validate
}

// Validate implements echo.Validator.
func (cv *CustomValidator) Validate(i interface{}) error {
	return cv.v.Struct(i)
}

// NewCustomValidator creates a ready-to-use CustomValidator.
func NewCustomValidator() *CustomValidator {
	return &CustomValidator{v: validator.New()}
}

// CustomHTTPErrorHandler converts all errors — including echo.HTTPError — into
// the uniform {"error": "human-readable message"} JSON shape required by D-04.
// Assign to: e.HTTPErrorHandler = CustomHTTPErrorHandler
func CustomHTTPErrorHandler(err error, c echo.Context) {
	code := http.StatusInternalServerError
	msg := "internal server error"
	errCode := ""

	var he *echo.HTTPError
	if errors.As(err, &he) {
		code = he.Code
		if s, ok := he.Message.(string); ok {
			msg = s
		}
	}

	// Extract error code from wrapped error messages (e.g., "PAY_SCHEDULE_REQUIRED")
	errMsg := err.Error()
	if idx := strings.Index(errMsg, "PAY_SCHEDULE_REQUIRED"); idx != -1 {
		errCode = "PAY_SCHEDULE_REQUIRED"
		msg = "You need to set up your pay schedule before using Can I Buy It. Use POST /api/pay-schedule to configure."
	}

	// Suppress error if response already committed (client disconnected).
	if errCode != "" {
		_ = c.JSON(code, map[string]string{"error": msg, "code": errCode})
	} else {
		_ = c.JSON(code, map[string]string{"error": msg})
	}
}

// httpError maps a service error to an HTTP error without leaking internals:
// validation -> 400 (message is client-safe), no rows -> 404, anything else -> 500
// with a generic message and the real error logged server-side.
func httpError(err error) *echo.HTTPError {
	var ve *service.ValidationError
	switch {
	case errors.As(err, &ve):
		return echo.NewHTTPError(http.StatusBadRequest, ve.Msg)
	case errors.Is(err, sql.ErrNoRows):
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	case errors.Is(err, service.ErrPayScheduleRequired):
		// CustomHTTPErrorHandler keys off this token to add the client error code.
		return echo.NewHTTPError(http.StatusInternalServerError, service.ErrPayScheduleRequired.Error())
	}
	log.Printf("internal error: %v", err)
	return echo.NewHTTPError(http.StatusInternalServerError, "internal server error")
}
