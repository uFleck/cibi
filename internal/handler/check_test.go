package handler

import "testing"

// TestCheck verifies POST /check with {"amount": 75.00} returns 200 +
// {"can_buy":...,"purchasing_power":...,"buffer_remaining":...,"risk_level":"..."}.
func TestCheck(t *testing.T) {
	t.Skip("not implemented")
}

// TestCheck_NegativeAmount verifies POST /check with {"amount": -5.00} returns 400
// with {"error":"..."}.
func TestCheck_NegativeAmount(t *testing.T) {
	t.Skip("not implemented")
}

// TestCheck_MalformedBody verifies POST /check with malformed JSON returns 400
// with {"error":"..."}.
func TestCheck_MalformedBody(t *testing.T) {
	t.Skip("not implemented")
}
