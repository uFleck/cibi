package main

import (
	"fmt"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi-api/db"
	"github.com/ufleck/cibi-api/handlers"
	"github.com/ufleck/cibi-api/repos"
	"github.com/ufleck/cibi-api/services"
)

func main() {
	err := db.Init()
	if err != nil {
		fmt.Println(err)
		return
	}

	accountsRepo := repos.SqliteAccRepo{}
	txnsRepo := repos.NewSqliteTxnsRepo(&accountsRepo)
	txnsSrvc := services.NewTransactionsSrvc(&txnsRepo, &accountsRepo)
	accSrvc := services.NewAccountsSrvc(&accountsRepo, &txnsRepo, txnsSrvc)

	e := echo.New()

	accHandler := handlers.AccountsHandler{
		AccSrvc: &accSrvc,
	}
	txnsHandler := handlers.TransactionsHandler{
		TxnsSrvc: txnsSrvc,
	}

	handlers.SetupRoutes(e, &accHandler, &txnsHandler)

	e.Logger.Fatal(e.Start(":42069"))
}
