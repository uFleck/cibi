package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/ufleck/cibi/internal/app"
	"github.com/ufleck/cibi/internal/config"
)

var application *app.App

var rootCmd = &cobra.Command{
	Use:   "cibi",
	Short: "Can I Buy It? — personal finance CLI",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		configPath, _ := cmd.Flags().GetString("config")
		dbPath, _ := cmd.Flags().GetString("db")
		serverPort, _ := cmd.Flags().GetString("port")

		options := []config.Option{
			config.WithConfigPath(configPath),
			config.WithDatabasePath(dbPath),
			config.WithServerPort(serverPort),
		}

		cfg, err := config.LoadConfig(options...)
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}

		a, err := app.New(cfg)
		if err != nil {
			return fmt.Errorf("failed to initialize app: %w", err)
		}
		application = a
		return nil
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().String("config", "", "path to config file (overrides default ~/.config/cibi/config.yaml)")
	rootCmd.PersistentFlags().String("db", "", "path to SQLite database file (overrides config)")
	rootCmd.PersistentFlags().String("port", "", "HTTP server listen address (overrides config)")
}
