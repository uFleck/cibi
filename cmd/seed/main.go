package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/ufleck/cibi/db"
	"github.com/ufleck/cibi/internal/migrations"
	reposqlite "github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

func main() {
	dbPath := "./db/cibi.db"
	if len(os.Args) > 1 {
		dbPath = os.Args[1]
	}

	database, err := db.Init(dbPath)
	if err != nil {
		log.Fatalf("failed to init db: %v", err)
	}

	if err := migrations.Run(database); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	accRepo := reposqlite.NewSqliteAccountsRepo(database)
	psRepo := reposqlite.NewSqlitePayScheduleRepo(database)
	psSvc := service.NewPayScheduleService(psRepo, accRepo)

	// Get default account
	acc, err := accRepo.GetDefault()
	if err != nil {
		log.Fatalf("no default account found: %v", err)
	}

	// Check if pay schedule already exists
	schedules, err := psRepo.ListByAccountID(acc.ID)
	if err != nil {
		log.Fatalf("failed to check existing pay schedules: %v", err)
	}
	if len(schedules) > 0 {
		log.Printf("Pay schedule already exists for account %s", acc.ID)
		return
	}

	// Create default semi-monthly pay schedule (1st and 15th)
	dom2 := 15
	_, err = psSvc.CreatePaySchedule(
		acc.ID,
		"semi-monthly",
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		nil,
		&dom2,
		nil,
		0,
	)
	if err != nil {
		log.Fatalf("failed to create pay schedule: %v", err)
	}

	fmt.Printf("Created default semi-monthly pay schedule for account %s\n", acc.ID)
}
