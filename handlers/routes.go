package handlers

import "github.com/labstack/echo/v4"

func SetupRoutes(e *echo.Echo, ah *AccountsHandler, th *TransactionsHandler) {
	accGroup := e.Group("/accounts")
	accGroup.POST("/", ah.HandleCreateAcc)
	accGroup.GET("/default", ah.HandleGetDefaultAcc)
	accGroup.GET("/", ah.HandleGetAllAccs)
	accGroup.GET("/:id", ah.HandleGetAccById)
	accGroup.PATCH("/", ah.HandleUpdateAcc)
	accGroup.DELETE("/:id", ah.HandleDeleteAcc)

	txnsGroup := e.Group("/transactions")
	txnsGroup.POST("/", th.HandleCreateTxn)
}
