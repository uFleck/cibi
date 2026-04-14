package handler

import (
	_ "embed"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi/internal/service"
)

//go:embed docs/openapi.yaml
var openAPIYAML []byte

// SetupRoutes registers all application routes on the provided Echo instance.
// Called from internal/app/app.go after echo.New().
func SetupRoutes(
	e *echo.Echo,
	accSvc *service.AccountsService,
	txnsSvc *service.TransactionsService,
	engineSvc *service.EngineService,
	psSvc *service.PayScheduleService,
	friendSvc *service.FriendService,
	peerDebtSvc *service.PeerDebtService,
	groupEventSvc *service.GroupEventService,
) {
	ah := NewAccountsHandler(accSvc)
	th := NewTransactionsHandler(txnsSvc)
	ch := NewCheckHandler(engineSvc)
	psh := NewPayScheduleHandler(psSvc, ah.svc)

	api := e.Group("/api")

	acc := api.Group("/accounts")
	acc.GET("", ah.List)
	acc.POST("", ah.Create)
	acc.GET("/default", ah.GetDefault) // legacy shortcut; kept per <specifics>
	acc.GET("/:id", ah.GetByID)
	acc.POST("/:id/set-default", ah.SetDefault)
	acc.PATCH("/:id", ah.Update)
	acc.DELETE("/:id", ah.Delete)

	txn := api.Group("/transactions")
	txn.GET("", th.List)
	txn.POST("", th.Create)
	txn.PATCH("/:id", th.Update)
	txn.DELETE("/:id", th.Delete)

	api.POST("/check", ch.Check)

	ps := api.Group("/pay-schedule")
	ps.GET("", psh.List)
	ps.POST("", psh.Create)
	ps.PATCH("/:id", psh.Update)
	ps.DELETE("/:id", psh.Delete)

	api.GET("/docs", func(c echo.Context) error {
		return c.Blob(http.StatusOK, "application/yaml", openAPIYAML)
	})

	// Friend Ledger handlers.
	fh := NewFriendsHandler(friendSvc, peerDebtSvc)
	pdh := NewPeerDebtHandler(peerDebtSvc)
	geh := NewGroupEventHandler(groupEventSvc)
	ph := NewPublicHandler(friendSvc, peerDebtSvc, groupEventSvc)

	// Authenticated friend ledger routes under /api.
	friends := api.Group("/friends")
	friends.GET("", fh.List)
	friends.POST("", fh.Create)
	friends.GET("/summary", fh.Summary) // BEFORE /:id to avoid conflict
	friends.GET("/:id", fh.GetByID)
	friends.PATCH("/:id", fh.Update)
	friends.DELETE("/:id", fh.Delete)

	peerDebts := api.Group("/peer-debts")
	peerDebts.GET("", pdh.List)        // optional ?friend_id= query param
	peerDebts.POST("", pdh.Create)
	peerDebts.PATCH("/:id", pdh.Update)
	peerDebts.DELETE("/:id", pdh.Delete)
	peerDebts.POST("/:id/confirm", pdh.Confirm)

	groupEvents := api.Group("/group-events")
	groupEvents.GET("", geh.List)
	groupEvents.POST("", geh.Create)
	groupEvents.GET("/:id", geh.GetByID)
	groupEvents.PATCH("/:id", geh.Update)
	groupEvents.DELETE("/:id", geh.Delete)
	groupEvents.PUT("/:id/participants", geh.SetParticipants)

	// Public unauthenticated endpoints — no middleware.
	pub := e.Group("/public")
	pub.GET("/friend/:token", ph.GetFriendByToken)
	pub.GET("/group/:token", ph.GetGroupByToken)
}
