package app

import (
	"database/sql"
	"fmt"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/db"
	"github.com/ufleck/cibi/handlers"
	"github.com/ufleck/cibi/internal/config"
	"github.com/ufleck/cibi/internal/migrations"
	reposqlite "github.com/ufleck/cibi/internal/repo/sqlite"
	"github.com/ufleck/cibi/internal/service"
	"github.com/ufleck/cibi/repos"
	"github.com/ufleck/cibi/services"
)

// App is the fully wired application graph.
type App struct {
	cfg         config.Config
	db          *sql.DB
	Echo        *echo.Echo

	// Legacy handlers (Echo routing — not modified in Phase 2).
	AccHandler  *handlers.AccountsHandler
	TxnsHandler *handlers.TransactionsHandler

	// Phase 2: internal service layer (used by CLI in Phase 3).
	AccountsSvc *service.AccountsService
	TxnsSvc     *service.TransactionsService
	EngineSvc   *service.EngineService
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

	// --- Legacy wiring (repos/, services/, handlers/) ---
	accRepo := repos.NewSqliteAccRepo(database)
	txnsRepo := repos.NewSqliteTxnsRepo(accRepo, database)

	txnsSrvc := services.NewTransactionsSrvc(txnsRepo, accRepo)
	accSrvc := services.NewAccountsSrvc(accRepo, txnsRepo, txnsSrvc)

	accHandler := handlers.AccountsHandler{AccSrvc: &accSrvc}
	txnsHandler := handlers.TransactionsHandler{TxnsSrvc: txnsSrvc}

	e := echo.New()
	handlers.SetupRoutes(e, &accHandler, &txnsHandler)

	// --- Phase 2: internal repo + service wiring ---
	iAccRepo := reposqlite.NewSqliteAccountsRepo(database)
	iTxnsRepo := reposqlite.NewSqliteTxnsRepo(database)
	iPsRepo := reposqlite.NewSqlitePayScheduleRepo(database)
	iBufRepo := reposqlite.NewSqliteSafetyBufferRepo(database)

	accountsSvc := service.NewAccountsService(iAccRepo)
	txnsSvc := service.NewTransactionsService(iTxnsRepo, iAccRepo)
	engineSvc := service.NewEngineService(iAccRepo, iTxnsRepo, iPsRepo, iBufRepo)

	return &App{
		cfg:         cfg,
		db:          database,
		Echo:        e,
		AccHandler:  &accHandler,
		TxnsHandler: &txnsHandler,
		AccountsSvc: accountsSvc,
		TxnsSvc:     txnsSvc,
		EngineSvc:   engineSvc,
	}, nil
}

// Start starts the Echo HTTP server.
func (a *App) Start() error {
	return a.Echo.Start(a.cfg.ServerPort)
}
