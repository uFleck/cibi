package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// generatePublicToken creates a 32-character hex token using 16 bytes of
// cryptographically random data (128-bit entropy).
func generatePublicToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generatePublicToken: %w", err)
	}
	return hex.EncodeToString(b), nil
}
