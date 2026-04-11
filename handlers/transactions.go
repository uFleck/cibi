package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi-api/services"
	"github.com/ufleck/cibi-api/types"
)

type TransactionsHandler struct {
	TxnsSrvc services.TransactionsSrvc
}

func (th *TransactionsHandler) HandleCreateTxn(c echo.Context) error {
	var txn types.NewTransaction

	err := json.NewDecoder(c.Request().Body).Decode(&txn)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	defer c.Request().Body.Close()

	fmt.Println(txn)

	err = th.TxnsSrvc.CreateTransaction(txn)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusCreated)
}
