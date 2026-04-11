package app

import (
	"database/sql"
	"fmt"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/db"
	"github.com/ufleck/cibi/handlers"
	"github.com/ufleck/cibi/internal/config"
	"github.com/ufleck/cibi/internal/migrations"
	"github.com/ufleck/cibi/repos"
	"github.com/ufleck/cibi/services"
)

type App struct {
	cfg         config.Config
	db          *sql.DB
	Echo        *echo.Echo
	AccHandler  *handlers.AccountsHandler
	TxnsHandler *handlers.TransactionsHandler
}

func New(cfg config.Config) (*App, error) {
	database, err := db.Init(cfg.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to init db: %w", err)
	}

	if err := migrations.Run(database); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	accRepo := repos.NewSqliteAccRepo(database)
	txnsRepo := repos.NewSqliteTxnsRepo(accRepo, database)

	txnsSrvc := services.NewTransactionsSrvc(txnsRepo, accRepo)
	accSrvc := services.NewAccountsSrvc(accRepo, txnsRepo, txnsSrvc)

	accHandler := handlers.AccountsHandler{
		AccSrvc: &accSrvc,
	}
	txnsHandler := handlers.TransactionsHandler{
		TxnsSrvc: txnsSrvc,
	}

	e := echo.New()
	handlers.SetupRoutes(e, &accHandler, &txnsHandler)

	return &App{
		cfg:         cfg,
		db:          database,
		Echo:        e,
		AccHandler:  &accHandler,
		TxnsHandler: &txnsHandler,
	}, nil
}

func (a *App) Start() error {
	return a.Echo.Start(a.cfg.ServerPort)
}
