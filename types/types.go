package types

import (
	"time"

	"github.com/google/uuid"
)

type NewAccount struct {
	Name      string `json:"name"`
	IsDefault bool   `json:"is_default"`
}

type UpdateAccount struct {
	Name      string   `json:"name"`
	Balance   *float64 `json:"balance"`
	IsDefault *bool    `json:"is_default"`
}

type NewTransaction struct {
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Value       float64   `json:"value"`
	EvaluatesAt time.Time `json:"evaluates_at"`
	AccountId   uuid.UUID `json:"account_id"`
}
