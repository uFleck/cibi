package app

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/db"
	"github.com/ufleck/cibi/internal/config"
	"github.com/ufleck/cibi/internal/handler"
	"github.com/ufleck/cibi/internal/migrations"
	reposqlite "github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
)

// App is the fully wired application graph.
type App struct {
	cfg            config.Config
	db             *sql.DB
	Echo           *echo.Echo
	AccountsSvc    *service.AccountsService
	TxnsSvc        *service.TransactionsService
	EngineSvc      *service.EngineService
	PayScheduleSvc *service.PayScheduleService
}

// New creates and wires the entire application graph.
func New(cfg config.Config) (*App, error) {
	database, err := db.Init(cfg.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to init db: %w", err)
	}

	if err := migrations.Run(database); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	// Internal repo + service wiring.
	iAccRepo := reposqlite.NewSqliteAccountsRepo(database)
	iTxnsRepo := reposqlite.NewSqliteTxnsRepo(database)
	iPsRepo := reposqlite.NewSqlitePayScheduleRepo(database)
	iBufRepo := reposqlite.NewSqliteSafetyBufferRepo(database)

	accountsSvc := service.NewAccountsService(iAccRepo)
	txnsSvc := service.NewTransactionsService(iTxnsRepo, iAccRepo)
	engineSvc := service.NewEngineService(iAccRepo, iTxnsRepo, iPsRepo, iBufRepo)
	payScheduleSvc := service.NewPayScheduleService(iPsRepo, iAccRepo)

	e := echo.New()
	e.HTTPErrorHandler = handler.CustomHTTPErrorHandler
	e.Validator = handler.NewCustomValidator()

	handler.SetupRoutes(e, accountsSvc, txnsSvc, engineSvc, payScheduleSvc)

	return &App{
		cfg:            cfg,
		db:             database,
		Echo:           e,
		AccountsSvc:    accountsSvc,
		TxnsSvc:        txnsSvc,
		EngineSvc:      engineSvc,
		PayScheduleSvc: payScheduleSvc,
	}, nil
}

// Start starts the Echo HTTP server.
func (a *App) Start() error {
	return a.Echo.Start(a.cfg.ServerPort)
}

// Shutdown gracefully stops the Echo server with the provided context timeout.
func (a *App) Shutdown(ctx context.Context) error {
	return a.Echo.Shutdown(ctx)
}
