package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigDefaultsWhenNoFileOrEnv(t *testing.T) {
	t.Setenv("CIBI_DATABASE_PATH", "")
	os.Unsetenv("CIBI_DATABASE_PATH")
	os.Unsetenv("CIBI_SERVER_PORT")
	os.Unsetenv("CIBI_SAFETY_BUFFER")

	cfg, err := LoadConfig(WithHomeDir(t.TempDir()))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.DatabasePath != DefaultDatabasePath {
		t.Fatalf("DatabasePath = %q, want %q", cfg.DatabasePath, DefaultDatabasePath)
	}
	if cfg.ServerPort != DefaultServerPort {
		t.Fatalf("ServerPort = %q, want %q", cfg.ServerPort, DefaultServerPort)
	}
	if cfg.SafetyBuffer != DefaultSafetyBuffer {
		t.Fatalf("SafetyBuffer = %d, want %d", cfg.SafetyBuffer, DefaultSafetyBuffer)
	}
}

func TestConfigPrecedenceCLIEnvFileDefaults(t *testing.T) {
	home := t.TempDir()
	configDir := filepath.Join(home, ".config", "cibi")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	configPath := filepath.Join(configDir, "config.yaml")
	fileConfig := []byte("database_path: file.db\nserver_port: ':1000'\nsafety_buffer: 100\n")
	if err := os.WriteFile(configPath, fileConfig, 0o644); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	t.Setenv("CIBI_DATABASE_PATH", "env.db")
	t.Setenv("CIBI_SERVER_PORT", ":2000")
	t.Setenv("CIBI_SAFETY_BUFFER", "200")

	cfg, err := LoadConfig(
		WithHomeDir(home),
		WithDatabasePath("cli.db"),
		WithServerPort(":3000"),
		WithSafetyBuffer(300),
	)
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.DatabasePath != "cli.db" {
		t.Fatalf("DatabasePath = %q, want CLI override", cfg.DatabasePath)
	}
	if cfg.ServerPort != ":3000" {
		t.Fatalf("ServerPort = %q, want CLI override", cfg.ServerPort)
	}
	if cfg.SafetyBuffer != 300 {
		t.Fatalf("SafetyBuffer = %d, want CLI override", cfg.SafetyBuffer)
	}
}

func TestConfigEnvOverridesFileWhenCLIAbsent(t *testing.T) {
	home := t.TempDir()
	configDir := filepath.Join(home, ".config", "cibi")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(configDir, "config.yaml"), []byte("database_path: file.db\nserver_port: ':1000'\nsafety_buffer: 100\n"), 0o644); err != nil {
		t.Fatalf("write config file: %v", err)
	}

	t.Setenv("CIBI_DATABASE_PATH", "env.db")
	t.Setenv("CIBI_SERVER_PORT", ":2000")
	t.Setenv("CIBI_SAFETY_BUFFER", "200")

	cfg, err := LoadConfig(WithHomeDir(home))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.DatabasePath != "env.db" || cfg.ServerPort != ":2000" || cfg.SafetyBuffer != 200 {
		t.Fatalf("env precedence failed: %#v", cfg)
	}
}

func TestConfigRejectsMalformedSafetyBufferEnv(t *testing.T) {
	t.Setenv("CIBI_SAFETY_BUFFER", "not-an-int")

	_, err := LoadConfig(WithHomeDir(t.TempDir()))
	if err == nil {
		t.Fatal("LoadConfig returned nil error for malformed CIBI_SAFETY_BUFFER")
	}
}
