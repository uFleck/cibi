package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"github.com/ufleck/cibi/internal/app"
	"github.com/ufleck/cibi/internal/config"
)

var application *app.App

var rootCmd = &cobra.Command{
	Use:   "cibi",
	Short: "Can I Buy It? — personal finance CLI",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		configPath, _ := cmd.Flags().GetString("config")
		if configPath != "" {
			viper.SetConfigFile(configPath)
		} else {
			home, _ := os.UserHomeDir()
			viper.AddConfigPath(home + "/.config/cibi")
			viper.SetConfigName("config")
			viper.SetConfigType("yaml")
		}

		viper.SetEnvPrefix("cibi")
		viper.AutomaticEnv()

		viper.SetDefault("DatabasePath", "./db/cibi.db")
		viper.SetDefault("ServerPort", ":42069")
		viper.SetDefault("SafetyBuffer", 1000)

		if err := viper.ReadInConfig(); err != nil {
			var notFound viper.ConfigFileNotFoundError
			if !errors.As(err, &notFound) {
				return fmt.Errorf("failed to read config: %w", err)
			}
		}

		var cfg config.Config
		if err := viper.Unmarshal(&cfg); err != nil {
			return fmt.Errorf("failed to unmarshal config: %w", err)
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
	_ = viper.BindPFlag("DatabasePath", rootCmd.PersistentFlags().Lookup("db"))
}
