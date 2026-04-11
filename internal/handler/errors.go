package handler

import (
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
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

	var he *echo.HTTPError
	if errors.As(err, &he) {
		code = he.Code
		if s, ok := he.Message.(string); ok {
			msg = s
		}
	}

	// Suppress error if response already committed (client disconnected).
	_ = c.JSON(code, map[string]string{"error": msg})
}
