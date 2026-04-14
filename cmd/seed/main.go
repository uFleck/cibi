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
	_, err = psRepo.GetByAccountID(acc.ID)
	if err == nil {
		log.Printf("Pay schedule already exists for account %s", acc.ID)
		return
	}

	// Create default biweekly pay schedule
	dom1 := 1
	dom2 := 15
	err = psSvc.SetPaySchedule(
		acc.ID,
		"biweekly",
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		&dom1,
		&dom2,
		nil,
	)
	if err != nil {
		log.Fatalf("failed to set pay schedule: %v", err)
	}

	fmt.Printf("Created default biweekly pay schedule for account %s\n", acc.ID)
}
