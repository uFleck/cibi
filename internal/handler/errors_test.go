package handler

import "testing"

// TestBadRequest verifies that any handler receiving malformed JSON returns
// {"error":"..."} (not {"message":"..."}).
func TestBadRequest(t *testing.T) {
	t.Skip("not implemented")
}

// TestErrorShape verifies customHTTPErrorHandler produces {"error":"..."} for
// both *echo.HTTPError and generic errors.
func TestErrorShape(t *testing.T) {
	t.Skip("not implemented")
}

// TestNotFound verifies 404 responses have {"error":"..."} shape not Echo's
// default HTML.
func TestNotFound(t *testing.T) {
	t.Skip("not implemented")
}
