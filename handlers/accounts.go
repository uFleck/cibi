package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/ufleck/cibi-api/services"
	"github.com/ufleck/cibi-api/types"
)

type AccountsHandler struct {
	AccSrvc *services.AccountsSrvc
}

func (ah *AccountsHandler) HandleCreateAcc(c echo.Context) error {
	var acc types.NewAccount

	err := json.NewDecoder(c.Request().Body).Decode(&acc)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	err = ah.AccSrvc.CreateAccount(acc)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusCreated)
}

func (ah *AccountsHandler) HandleGetAccById(c echo.Context) error {
	paramAccId := c.Param("id")
	accId, err := uuid.Parse(paramAccId)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	acc, err := ah.AccSrvc.GetAccountById(accId)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, acc)
}

func (ah *AccountsHandler) HandleGetDefaultAcc(c echo.Context) error {
	acc, err := ah.AccSrvc.GetDefaultAccount()

	if err != nil {
		return c.String(http.StatusNotFound, err.Error())
	}

	return c.JSON(http.StatusOK, acc)
}

func (ah *AccountsHandler) HandleGetAllAccs(c echo.Context) error {
	accs, err := ah.AccSrvc.GetAccounts()

	if err != nil {
		return c.String(http.StatusNotFound, err.Error())
	}

	return c.JSON(http.StatusOK, accs)
}

func (ah *AccountsHandler) HandleUpdateAcc(c echo.Context) error {
	paramId := c.QueryParam("id")

	id, err := uuid.Parse(paramId)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	var updateAcc types.UpdateAccount

	err = json.NewDecoder(c.Request().Body).Decode(&updateAcc)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	err = ah.AccSrvc.UpdateAccount(id, updateAcc)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusOK)
}

func (ah *AccountsHandler) HandleDeleteAcc(c echo.Context) error {
	paramId := c.Param("id")
	id, err := uuid.Parse(paramId)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	err = ah.AccSrvc.DeleteAccount(id)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusOK)
}
