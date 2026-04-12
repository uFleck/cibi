package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labstack/echo/v4/middleware"
	"github.com/ufleck/cibi/internal/app"
	"github.com/ufleck/cibi/internal/config"
)

func main() {
	cfg := config.LoadConfig()

	application, err := app.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize app: %v", err)
	}

	// Serve the built React SPA from the embedded web/dist directory.
	// HTML5: true forwards unknown paths to index.html for client-side routing.
	// MUST be registered after SetupRoutes (already called inside app.New).
	distFS, err := WebDistFS()
	if err != nil {
		log.Fatalf("Failed to sub web/dist: %v", err)
	}
	application.Echo.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		HTML5:      true,
		Root:       ".",
		Filesystem: http.FS(distFS),
	}))

	// Start server in background goroutine.
	go func() {
		if err := application.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Block until SIGINT (Ctrl+C) or SIGTERM (container/systemd stop).
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Allow up to 10 seconds for in-flight requests to finish.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := application.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}
	log.Println("Server stopped cleanly.")
}
