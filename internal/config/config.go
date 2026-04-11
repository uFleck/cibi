package config

import (
	"log"

	"github.com/spf13/viper"
)

type Config struct {
	DatabasePath string
	ServerPort   string
	SafetyBuffer int64
}

func LoadConfig() Config {
	viper.SetEnvPrefix("cibi")
	viper.AutomaticEnv()

	viper.SetDefault("DatabasePath", "./db/cibi.db")
	viper.SetDefault("ServerPort", ":42069")
	viper.SetDefault("SafetyBuffer", 0)

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		log.Fatalf("unable to decode into struct, %v", err)
	}

	return config
}
