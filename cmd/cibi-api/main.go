package main

import (
	"log"

	"github.com/ufleck/cibi/internal/app"
	"github.com/ufleck/cibi/internal/config"
)

func main() {
	cfg := config.LoadConfig()

	application, err := app.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize app: %v", err)
	}

	if err := application.Start(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
