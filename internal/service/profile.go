package service

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/ufleck/cibi/internal/repo/sqlite"
)

var validThemes = map[string]bool{
	"green-anchor":    true,
	"neutral-command": true,
	"teal-bridge":     true,
	"warm-amber":      true,
	"rose-noir":       true,
}

// ProfileService handles app owner profile settings.
type ProfileService struct {
	repo sqlite.ProfileRepo
}

func NewProfileService(repo sqlite.ProfileRepo) *ProfileService {
	return &ProfileService{repo: repo}
}

func (s *ProfileService) GetByAccount(accountID uuid.UUID) (sqlite.UserProfile, error) {
	p, err := s.repo.GetByAccount(accountID)
	if err != nil {
		return p, fmt.Errorf("service.Profile.GetByAccount: %w", err)
	}
	return p, nil
}

func (s *ProfileService) UpdateByAccount(accountID uuid.UUID, displayName string, pixKey *string, theme string) error {
	name := strings.TrimSpace(displayName)
	if name == "" {
		return fmt.Errorf("display_name is required")
	}
	if pixKey != nil {
		v := strings.TrimSpace(*pixKey)
		pixKey = &v
		if v == "" {
			pixKey = nil
		}
	}
	if !validThemes[theme] {
		return fmt.Errorf("invalid theme %q: must be one of green-anchor, neutral-command, teal-bridge, warm-amber, rose-noir", theme)
	}
	if err := s.repo.UpsertByAccount(accountID, name, pixKey, theme); err != nil {
		return fmt.Errorf("service.Profile.UpdateByAccount: %w", err)
	}
	return nil
}
