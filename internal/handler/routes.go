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
func SetupRoutes(e *echo.Echo, accSvc *service.AccountsService, txnsSvc *service.TransactionsService, engineSvc *service.EngineService) {
	ah := NewAccountsHandler(accSvc)
	th := NewTransactionsHandler(txnsSvc)
	ch := NewCheckHandler(engineSvc)

	acc := e.Group("/accounts")
	acc.GET("", ah.List)
	acc.POST("", ah.Create)
	acc.GET("/default", ah.GetDefault) // legacy shortcut; kept per <specifics>
	acc.GET("/:id", ah.GetByID)
	acc.PATCH("/:id", ah.Update)
	acc.DELETE("/:id", ah.Delete)

	txn := e.Group("/transactions")
	txn.GET("", th.List)
	txn.POST("", th.Create)
	txn.PATCH("/:id", th.Update)
	txn.DELETE("/:id", th.Delete)

	e.POST("/check", ch.Check)

	e.GET("/docs", func(c echo.Context) error {
		return c.Blob(http.StatusOK, "application/yaml", openAPIYAML)
	})
}
