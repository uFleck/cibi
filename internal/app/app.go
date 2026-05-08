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
	FriendSvc      *service.FriendService
	PeerDebtSvc    *service.PeerDebtService
	GroupEventSvc  *service.GroupEventService
	ProfileSvc     *service.ProfileService
	GoalsSvc       *service.GoalsService
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
	iFriendRepo := reposqlite.NewSqliteFriendRepo(database)
	iPeerDebtRepo := reposqlite.NewSqlitePeerDebtRepo(database)
	iGroupEvtRepo := reposqlite.NewSqliteGroupEventRepo(database)
	iProfileRepo := reposqlite.NewSqliteProfileRepo(database)

	accountsSvc := service.NewAccountsService(iAccRepo)
	txnsSvc := service.NewTransactionsService(database, iTxnsRepo, iAccRepo)
	goalsRepo := reposqlite.NewSqliteGoalsRepo(database)
	goalsSvc := service.NewGoalsService(database, goalsRepo, iAccRepo)
	engineSvc := service.NewEngineService(iAccRepo, iTxnsRepo, iPsRepo, iPeerDebtRepo, iGroupEvtRepo, goalsRepo)
	payScheduleSvc := service.NewPayScheduleService(database, iPsRepo, iAccRepo)
	friendSvc := service.NewFriendService(iFriendRepo)
	peerDebtSvc := service.NewPeerDebtService(iPeerDebtRepo)
	groupEventSvc := service.NewGroupEventService(iGroupEvtRepo, iFriendRepo)
	profileSvc := service.NewProfileService(iProfileRepo)

	e := echo.New()
	e.HTTPErrorHandler = handler.CustomHTTPErrorHandler
	e.Validator = handler.NewCustomValidator()

	handler.SetupRoutes(e, accountsSvc, txnsSvc, goalsSvc, engineSvc, payScheduleSvc, friendSvc, peerDebtSvc, groupEventSvc, profileSvc)

	return &App{
		cfg:            cfg,
		db:             database,
		Echo:           e,
		AccountsSvc:    accountsSvc,
		TxnsSvc:        txnsSvc,
		EngineSvc:      engineSvc,
		PayScheduleSvc: payScheduleSvc,
		FriendSvc:      friendSvc,
		PeerDebtSvc:    peerDebtSvc,
		GroupEventSvc:  groupEventSvc,
		ProfileSvc:     profileSvc,
		GoalsSvc:       goalsSvc,
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

// Close releases owned resources that are not managed by Echo shutdown.
func (a *App) Close() error {
	if a.db == nil {
		return nil
	}
	return a.db.Close()
}
