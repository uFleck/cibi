package service

import (
	"fmt"
	"strings"

	"github.com/ufleck/cibi/internal/repo/sqlite"
)

// ProfileService handles app owner profile settings.
type ProfileService struct {
	repo sqlite.ProfileRepo
}

func NewProfileService(repo sqlite.ProfileRepo) *ProfileService {
	return &ProfileService{repo: repo}
}

func (s *ProfileService) Get() (sqlite.UserProfile, error) {
	p, err := s.repo.Get()
	if err != nil {
		return p, fmt.Errorf("service.Profile.Get: %w", err)
	}
	return p, nil
}

func (s *ProfileService) Update(displayName string, pixKey *string) error {
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
	if err := s.repo.Upsert(name, pixKey); err != nil {
		return fmt.Errorf("service.Profile.Update: %w", err)
	}
	return nil
}
