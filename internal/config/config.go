package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"go.yaml.in/yaml/v3"
)

const (
	DefaultDatabasePath = "db/cibi.db"
	DefaultServerPort   = ":42069"
	DefaultSafetyBuffer = int64(1000)
)

// Config contains runtime settings needed to wire the application.
type Config struct {
	DatabasePath string `yaml:"database_path"`
	ServerPort   string `yaml:"server_port"`
	SafetyBuffer int64  `yaml:"safety_buffer"`
}

type loadOptions struct {
	configPath     string
	databasePath   *string
	serverPort     *string
	safetyBuffer   *int64
	homeDir        string
	ignoreNotFound bool
}

// Option customizes LoadConfig. Option values represent explicit CLI-level
// inputs, so they take precedence over environment variables and config files.
type Option func(*loadOptions)

func WithConfigPath(path string) Option {
	return func(o *loadOptions) {
		o.configPath = path
	}
}

func WithDatabasePath(path string) Option {
	return func(o *loadOptions) {
		if path != "" {
			o.databasePath = &path
		}
	}
}

func WithServerPort(port string) Option {
	return func(o *loadOptions) {
		if port != "" {
			o.serverPort = &port
		}
	}
}

func WithSafetyBuffer(buffer int64) Option {
	return func(o *loadOptions) {
		o.safetyBuffer = &buffer
	}
}

// WithHomeDir is intended for tests that need deterministic default config
// lookup without depending on the process user's home directory.
func WithHomeDir(home string) Option {
	return func(o *loadOptions) {
		o.homeDir = home
	}
}

// LoadConfig loads configuration with deterministic precedence:
// explicit options (CLI flags) > CIBI_* environment variables >
// ~/.config/cibi/config.yaml (or WithConfigPath) > defaults.
func LoadConfig(opts ...Option) (Config, error) {
	options := loadOptions{ignoreNotFound: true}
	for _, opt := range opts {
		opt(&options)
	}

	cfg := Config{
		DatabasePath: DefaultDatabasePath,
		ServerPort:   DefaultServerPort,
		SafetyBuffer: DefaultSafetyBuffer,
	}

	configPath, err := resolveConfigPath(options)
	if err != nil {
		return Config{}, err
	}
	if err := loadFile(configPath, &cfg, options.ignoreNotFound && options.configPath == ""); err != nil {
		return Config{}, err
	}
	if err := applyEnv(&cfg); err != nil {
		return Config{}, err
	}
	applyExplicitOptions(&cfg, options)

	return cfg, nil
}

func resolveConfigPath(options loadOptions) (string, error) {
	if options.configPath != "" {
		return options.configPath, nil
	}

	home := options.homeDir
	if home == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve home directory for config lookup: %w", err)
		}
	}
	return filepath.Join(home, ".config", "cibi", "config.yaml"), nil
}

func loadFile(path string, cfg *Config, ignoreNotFound bool) error {
	contents, err := os.ReadFile(path)
	if err != nil {
		if ignoreNotFound && errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read config file %q: %w", path, err)
	}
	if len(contents) == 0 {
		return nil
	}
	if err := yaml.Unmarshal(contents, cfg); err != nil {
		return fmt.Errorf("parse config file %q: %w", path, err)
	}
	return nil
}

func applyEnv(cfg *Config) error {
	if value, ok := os.LookupEnv("CIBI_DATABASE_PATH"); ok {
		cfg.DatabasePath = value
	}
	if value, ok := os.LookupEnv("CIBI_SERVER_PORT"); ok {
		cfg.ServerPort = value
	}
	if value, ok := os.LookupEnv("CIBI_SAFETY_BUFFER"); ok {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return fmt.Errorf("parse CIBI_SAFETY_BUFFER: %w", err)
		}
		cfg.SafetyBuffer = parsed
	}
	return nil
}

func applyExplicitOptions(cfg *Config, options loadOptions) {
	if options.databasePath != nil {
		cfg.DatabasePath = *options.databasePath
	}
	if options.serverPort != nil {
		cfg.ServerPort = *options.serverPort
	}
	if options.safetyBuffer != nil {
		cfg.SafetyBuffer = *options.safetyBuffer
	}
}
