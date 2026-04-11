# Phase 03: CLI - Plan

**Phase:** 3
**Created:** 2026-04-11
**Wave:** 1
**Status:** Ready to execute

---

## Architectural Decisions (Resolve All Blockers Before Executing)

### BLOCKER 1 — Account access via App

**Decision:** Add `AccountsSvc *service.AccountsService` to `internal/app/app.go`. Create `internal/service/accounts.go` with a thin `AccountsService` struct wrapping `sqlite.AccountsRepo`. This mirrors the exact pattern of `TransactionsService` — no direct repo exposure from App, consistent layering.

### BLOCKER 2 — Package layout

**Decision: Option A.** All CLI Go files live in `cmd/cibi/` as `package main`. Files: `main.go`, `root.go`, `account.go`, `tx.go`, `check.go`. `main.go` calls `Execute()` defined in `root.go`. No sub-package.

### BLOCKER 3 — `cibi tx list` without `--account`

**Decision:** `--account` flag is optional. When absent, resolve the default account via `app.AccountsSvc.GetDefault()` and pass that account's ID to `app.TxnsSvc.ListTransactions()`. No new service method required.

### WARNING 5 — SafetyBuffer default

**Decision:** Update `config.LoadConfig()` to use `viper.SetDefault("SafetyBuffer", 1000)` (per D-08: 1000 cents = $10.00). Both `cmd/cibi-api` and `cmd/cibi` share the same `LoadConfig()`, so they agree automatically.

### WARNING 7 — Amount units for `--amount` flag

**Decision:** `--amount` flag on `cibi tx add` accepts **decimal dollars** (e.g., `8.50` or `-850.00`). The CLI converts to cents before passing to the service layer: `cents = int64(math.Round(amount * 100))`. `cibi check <amount>` also accepts decimal dollars: `cents = int64(math.Round(amount * 100))`. Consistent UX throughout.

---

## Dependency Map

- Task 03-01 creates `AccountsService` — blocks Task 03-02 (account commands) and Task 03-03 (tx commands, for default-account resolution)
- Task 03-02 and Task 03-03 depend on Task 03-01
- Task 03-04 (check command) depends on Task 03-01 (App wiring complete)
- Tasks 03-02, 03-03, 03-04 can be executed sequentially after 03-01 (all share `cmd/cibi/`)

---

## Tasks

---

### Task 03-01: AccountsService + App wiring + Config fix

**Files Modified:** `internal/service/accounts.go` (new), `internal/app/app.go`, `internal/config/config.go`
**Requirements:** CLI-01, CLI-02

```
<read_first>
- internal/app/app.go (current wiring — understand iAccRepo construction on line 58 and App struct fields)
- internal/service/transactions.go (pattern to mirror for AccountsService)
- internal/repo/sqlite/accounts.go (AccountsRepo interface and all methods available)
- internal/config/config.go (current SafetyBuffer default to update)
- go.mod (module path: github.com/ufleck/cibi)
</read_first>

<acceptance_criteria>
- [ ] `internal/service/accounts.go` exists with `package service`
- [ ] `AccountsService` struct has an `accRepo sqlite.AccountsRepo` field
- [ ] `NewAccountsService(accRepo sqlite.AccountsRepo) *AccountsService` constructor exists
- [ ] `AccountsService` exposes: `ListAccounts() ([]sqlite.Account, error)`, `CreateAccount(a sqlite.Account) error`, `GetDefault() (sqlite.Account, error)`, `SetDefault(id uuid.UUID) error`, `DeleteAccount(id uuid.UUID) error`
- [ ] Each method wraps the corresponding repo method with `fmt.Errorf("service.XYZ: %w", err)` error wrapping
- [ ] `internal/app/app.go` has `AccountsSvc *service.AccountsService` field on the `App` struct
- [ ] `app.New()` assigns `AccountsSvc: service.NewAccountsService(iAccRepo)` before the return statement
- [ ] `internal/config/config.go` has `viper.SetDefault("SafetyBuffer", 1000)` (not 0)
- [ ] `go build ./...` succeeds with no errors after changes
- [ ] `grep -n "AccountsSvc" internal/app/app.go` returns a line in the struct definition and a line in the return statement
</acceptance_criteria>

<action>
**Step 1: Create `internal/service/accounts.go`**

Create the file with `package service`. Import `fmt`, `github.com/google/uuid`, and `github.com/ufleck/cibi/internal/repo/sqlite`.

Define:

```go
type AccountsService struct {
    accRepo sqlite.AccountsRepo
}

func NewAccountsService(accRepo sqlite.AccountsRepo) *AccountsService {
    return &AccountsService{accRepo: accRepo}
}

func (s *AccountsService) ListAccounts() ([]sqlite.Account, error) {
    accs, err := s.accRepo.GetAll()
    if err != nil {
        return nil, fmt.Errorf("service.ListAccounts: %w", err)
    }
    return accs, nil
}

func (s *AccountsService) CreateAccount(a sqlite.Account) error {
    if err := s.accRepo.Insert(a); err != nil {
        return fmt.Errorf("service.CreateAccount: %w", err)
    }
    return nil
}

func (s *AccountsService) GetDefault() (sqlite.Account, error) {
    acc, err := s.accRepo.GetDefault()
    if err != nil {
        return acc, fmt.Errorf("service.GetDefault: %w", err)
    }
    return acc, nil
}

func (s *AccountsService) SetDefault(id uuid.UUID) error {
    if err := s.accRepo.UpdateIsDefault(id, true); err != nil {
        return fmt.Errorf("service.SetDefault: %w", err)
    }
    return nil
}

func (s *AccountsService) DeleteAccount(id uuid.UUID) error {
    if err := s.accRepo.DeleteByID(id); err != nil {
        return fmt.Errorf("service.DeleteAccount: %w", err)
    }
    return nil
}
```

**Step 2: Update `internal/app/app.go`**

Add `AccountsSvc *service.AccountsService` to the `App` struct (after `TxnsSvc`, before `EngineSvc`).

In `New()`, after the `txnsSvc` and `engineSvc` assignments, add:
```go
accountsSvc := service.NewAccountsService(iAccRepo)
```

In the return statement, add `AccountsSvc: accountsSvc`.

The `iAccRepo` variable is already constructed on line 58 as `reposqlite.NewSqliteAccountsRepo(database)` — reuse it, do not construct a second one.

**Step 3: Fix SafetyBuffer default in `internal/config/config.go`**

Change `viper.SetDefault("SafetyBuffer", 0)` to `viper.SetDefault("SafetyBuffer", 1000)`.

**Step 4: Verify build**

Run `go build ./...` from the project root. Fix any import or compilation errors before marking done.
</action>
```

---

### Task 03-02: CLI root + account subcommands

**Files Modified:** `cmd/cibi/main.go` (new), `cmd/cibi/root.go` (new), `cmd/cibi/account.go` (new)
**Requirements:** CLI-01, CLI-02

```
<read_first>
- cmd/cibi-api/main.go (binary pattern to mirror — thin bootstrap calling app.New)
- internal/app/app.go (App struct fields available after Task 03-01: AccountsSvc, TxnsSvc, EngineSvc)
- internal/service/accounts.go (AccountsService methods available: ListAccounts, CreateAccount, GetDefault, SetDefault, DeleteAccount)
- internal/repo/sqlite/accounts.go (Account struct fields: ID uuid.UUID, Name string, CurrentBalance int64, Currency string, IsDefault bool)
- internal/config/config.go (LoadConfig — sets Viper defaults; Config fields: DatabasePath, ServerPort, SafetyBuffer)
- go.mod (module: github.com/ufleck/cibi; cobra and lipgloss not yet in go.mod — must `go get` them)
</read_first>

<acceptance_criteria>
- [ ] `cmd/cibi/main.go` exists with `package main` and a `main()` function that calls `Execute()`
- [ ] `cmd/cibi/root.go` exists with `package main`; defines `rootCmd` as a `*cobra.Command` with `Use: "cibi"`
- [ ] `rootCmd` has a `PersistentPreRunE` that loads config via Viper and stores the resulting `*app.App` in a package-level `application` variable
- [ ] `PersistentPreRunE` implements the full config loading sequence: read `--config` flag → if set call `viper.SetConfigFile(path)` else call `viper.AddConfigPath("$HOME/.config/cibi")` + `viper.SetConfigName("config")` → `viper.ReadInConfig()` tolerating `viper.ConfigFileNotFoundError` → `viper.Unmarshal(&cfg)` → `app.New(cfg)`
- [ ] `--config` persistent string flag registered on `rootCmd` (bound to Viper key `config`)
- [ ] `--db` persistent string flag registered on `rootCmd`; bound to Viper key `DatabasePath` via `viper.BindPFlag("DatabasePath", rootCmd.PersistentFlags().Lookup("db"))`
- [ ] `Execute()` function exported from `root.go`; exits with code 1 on error using `os.Exit(1)`
- [ ] `cmd/cibi/account.go` exists with `package main`; registers `accountCmd` on `rootCmd` in `init()`
- [ ] `cibi account list` prints a table with columns: `ID`, `NAME`, `BALANCE`, `DEFAULT`; balances formatted as `fmt.Sprintf("%.2f", float64(cents)/100.0)` (e.g., `150000` cents → `1500.00`)
- [ ] `cibi account add --name "Checking" --balance 150000 --currency USD` creates an account; prints `Account created: <uuid>`
- [ ] `cibi account set-default <uuid>` calls `AccountsSvc.SetDefault(id)`; prints `Default account updated`
- [ ] `cibi account delete <uuid>` calls `AccountsSvc.DeleteAccount(id)`; prints `Account deleted`
- [ ] `--balance` flag on `account add` accepts integer cents (raw storage unit, not dollars — accounts have no equivalent UX ambiguity, amounts are set programmatically)
- [ ] `go get github.com/spf13/cobra` and `go get github.com/charmbracelet/lipgloss` added to go.mod and go.sum
- [ ] `go build ./cmd/cibi/` succeeds
</acceptance_criteria>

<action>
**Step 1: Add dependencies**

From project root, run:
```
go get github.com/spf13/cobra@latest
go get github.com/charmbracelet/lipgloss@latest
```

**Step 2: Create `cmd/cibi/main.go`**

```go
package main

func main() {
    Execute()
}
```

**Step 3: Create `cmd/cibi/root.go`**

```go
package main

import (
    "errors"
    "fmt"
    "os"

    "github.com/spf13/cobra"
    "github.com/spf13/viper"
    "github.com/ufleck/cibi/internal/app"
    "github.com/ufleck/cibi/internal/config"
)

var application *app.App

var rootCmd = &cobra.Command{
    Use:   "cibi",
    Short: "Can I Buy It? — personal finance CLI",
    PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
        configPath, _ := cmd.Flags().GetString("config")
        if configPath != "" {
            viper.SetConfigFile(configPath)
        } else {
            home, _ := os.UserHomeDir()
            viper.AddConfigPath(home + "/.config/cibi")
            viper.SetConfigName("config")
            viper.SetConfigType("yaml")
        }

        viper.SetEnvPrefix("cibi")
        viper.AutomaticEnv()

        if err := viper.ReadInConfig(); err != nil {
            var notFound viper.ConfigFileNotFoundError
            if !errors.As(err, &notFound) {
                return fmt.Errorf("failed to read config: %w", err)
            }
            // No config file — use defaults only. That is fine.
        }

        var cfg config.Config
        if err := viper.Unmarshal(&cfg); err != nil {
            return fmt.Errorf("failed to unmarshal config: %w", err)
        }

        a, err := app.New(cfg)
        if err != nil {
            return fmt.Errorf("failed to initialize app: %w", err)
        }
        application = a
        return nil
    },
}

func Execute() {
    if err := rootCmd.Execute(); err != nil {
        os.Exit(1)
    }
}

func init() {
    rootCmd.PersistentFlags().String("config", "", "path to config file (overrides default ~/.config/cibi/config.yaml)")
    rootCmd.PersistentFlags().String("db", "", "path to SQLite database file (overrides config)")
    _ = viper.BindPFlag("DatabasePath", rootCmd.PersistentFlags().Lookup("db"))
}
```

**IMPORTANT:** Do NOT call `config.LoadConfig()` in `PersistentPreRunE`. Instead, set Viper defaults inline and then `viper.Unmarshal(&cfg)`. This allows `--config` to override the file path before defaults are applied. The defaults from `config.go`'s `LoadConfig()` will not be active here — inline the defaults:

After `viper.SetEnvPrefix("cibi")` / `viper.AutomaticEnv()` and before `ReadInConfig`, add:
```go
viper.SetDefault("DatabasePath", "./db/cibi.db")
viper.SetDefault("ServerPort", ":42069")
viper.SetDefault("SafetyBuffer", 1000)
```

**Step 4: Create `cmd/cibi/account.go`**

```go
package main

import (
    "fmt"
    "os"

    "github.com/google/uuid"
    "github.com/spf13/cobra"
    "github.com/ufleck/cibi/internal/repo/sqlite"
)

var accountCmd = &cobra.Command{
    Use:   "account",
    Short: "Manage accounts",
}

var accountListCmd = &cobra.Command{
    Use:   "list",
    Short: "List all accounts",
    RunE: func(cmd *cobra.Command, args []string) error {
        accounts, err := application.AccountsSvc.ListAccounts()
        if err != nil {
            return fmt.Errorf("failed to list accounts: %w", err)
        }
        // Header
        fmt.Printf("%-36s  %-20s  %10s  %s\n", "ID", "NAME", "BALANCE", "DEFAULT")
        fmt.Printf("%-36s  %-20s  %10s  %s\n", "------------------------------------", "--------------------", "----------", "-------")
        for _, a := range accounts {
            def := ""
            if a.IsDefault {
                def = "*"
            }
            balance := fmt.Sprintf("%.2f", float64(a.CurrentBalance)/100.0)
            fmt.Printf("%-36s  %-20s  %10s  %s\n", a.ID.String(), a.Name, balance, def)
        }
        return nil
    },
}

var accountAddCmd = &cobra.Command{
    Use:   "add",
    Short: "Add a new account",
    RunE: func(cmd *cobra.Command, args []string) error {
        name, _ := cmd.Flags().GetString("name")
        balance, _ := cmd.Flags().GetInt64("balance")
        currency, _ := cmd.Flags().GetString("currency")
        isDefault, _ := cmd.Flags().GetBool("default")

        if name == "" {
            return fmt.Errorf("--name is required")
        }

        a := sqlite.Account{
            ID:             uuid.New(),
            Name:           name,
            CurrentBalance: balance,
            Currency:       currency,
            IsDefault:      isDefault,
        }
        if err := application.AccountsSvc.CreateAccount(a); err != nil {
            return fmt.Errorf("failed to create account: %w", err)
        }
        fmt.Printf("Account created: %s\n", a.ID.String())
        return nil
    },
}

var accountSetDefaultCmd = &cobra.Command{
    Use:   "set-default <id>",
    Short: "Set an account as default",
    Args:  cobra.ExactArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        id, err := uuid.Parse(args[0])
        if err != nil {
            return fmt.Errorf("invalid account ID: %w", err)
        }
        if err := application.AccountsSvc.SetDefault(id); err != nil {
            return fmt.Errorf("failed to set default: %w", err)
        }
        fmt.Println("Default account updated")
        return nil
    },
}

var accountDeleteCmd = &cobra.Command{
    Use:   "delete <id>",
    Short: "Delete an account and its transactions",
    Args:  cobra.ExactArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        id, err := uuid.Parse(args[0])
        if err != nil {
            return fmt.Errorf("invalid account ID: %w", err)
        }
        if err := application.AccountsSvc.DeleteAccount(id); err != nil {
            return fmt.Errorf("failed to delete account: %w", err)
        }
        fmt.Println("Account deleted")
        return nil
    },
}

func init() {
    accountAddCmd.Flags().String("name", "", "account name (required)")
    accountAddCmd.Flags().Int64("balance", 0, "initial balance in cents (e.g., 150000 = $1500.00)")
    accountAddCmd.Flags().String("currency", "USD", "currency code")
    accountAddCmd.Flags().Bool("default", false, "set as default account")

    accountCmd.AddCommand(accountListCmd, accountAddCmd, accountSetDefaultCmd, accountDeleteCmd)
    rootCmd.AddCommand(accountCmd)

    // Suppress unused import error if needed
    _ = os.Stderr
}
```

**Step 5: Verify**

Run `go build ./cmd/cibi/`. Fix all compilation errors. The binary should compile cleanly.
</action>
```

---

### Task 03-03: Transaction subcommands (`cibi tx`)

**Files Modified:** `cmd/cibi/tx.go` (new)
**Requirements:** CLI-03

```
<read_first>
- cmd/cibi/root.go (application variable — App instance used by all commands)
- internal/service/transactions.go (TransactionsService methods: CreateTransaction, ListTransactions, UpdateTransaction, DeleteTransaction)
- internal/service/accounts.go (AccountsService.GetDefault — used when --account flag is absent)
- internal/repo/sqlite/transactions.go (Transaction struct fields; ValidFrequencies map; UpdateTransaction struct)
- cmd/cibi/account.go (pattern for subcommand registration and error handling to follow)
</read_first>

<acceptance_criteria>
- [ ] `cmd/cibi/tx.go` exists with `package main`
- [ ] `txCmd` registered on `rootCmd` in `init()`
- [ ] `cibi tx list` with no flags resolves default account via `application.AccountsSvc.GetDefault()` and calls `ListTransactions(accountID)` — does NOT error when `--account` is absent
- [ ] `cibi tx list --account <uuid>` calls `ListTransactions` with the specified account ID
- [ ] `cibi tx list` output includes columns: `ID`, `AMOUNT`, `DESCRIPTION`, `RECURRING`, `NEXT`; amounts displayed as decimal dollars (cents/100, 2 decimal places, with sign)
- [ ] `cibi tx add --amount -850.00 --description "Rent" --recurring --frequency monthly --anchor 2024-03-01` creates a recurring transaction against the default account
- [ ] `cibi tx add --amount -45.50 --description "Groceries"` creates a one-off transaction (no --recurring flag) — succeeds without --frequency or --anchor
- [ ] When `--recurring` is true and `--frequency` or `--anchor` is missing, command returns a user-friendly error: `"frequency and anchor are required for recurring transactions"`
- [ ] `--amount` accepts decimal dollars (positive or negative float64); converted to cents via `int64(math.Round(amount * 100))`
- [ ] `--anchor` flag accepts date string `2006-01-02` format; parsed with `time.Parse("2006-01-02", anchorStr)` then converted to UTC midnight `time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)`
- [ ] `cibi tx update <uuid> --description "New desc"` calls `UpdateTransaction` with a patch struct
- [ ] `cibi tx delete <uuid>` calls `DeleteTransaction(id)`; prints `Transaction deleted`
- [ ] When `--account` flag provided to `tx list`, it is a string flag parsed with `uuid.Parse`; invalid UUID returns `"invalid account ID: <error>"`
- [ ] `go build ./cmd/cibi/` succeeds after this file is added
</acceptance_criteria>

<action>
**Step 1: Create `cmd/cibi/tx.go`**

```go
package main

import (
    "fmt"
    "math"
    "time"

    "github.com/google/uuid"
    "github.com/spf13/cobra"
    "github.com/ufleck/cibi/internal/repo/sqlite"
)

var txCmd = &cobra.Command{
    Use:   "tx",
    Short: "Manage transactions",
}

var txListCmd = &cobra.Command{
    Use:   "list",
    Short: "List transactions",
    RunE: func(cmd *cobra.Command, args []string) error {
        accountStr, _ := cmd.Flags().GetString("account")

        var accountID uuid.UUID
        if accountStr != "" {
            id, err := uuid.Parse(accountStr)
            if err != nil {
                return fmt.Errorf("invalid account ID: %w", err)
            }
            accountID = id
        } else {
            acc, err := application.AccountsSvc.GetDefault()
            if err != nil {
                return fmt.Errorf("failed to get default account (use --account to specify): %w", err)
            }
            accountID = acc.ID
        }

        txns, err := application.TxnsSvc.ListTransactions(accountID)
        if err != nil {
            return fmt.Errorf("failed to list transactions: %w", err)
        }

        fmt.Printf("%-36s  %10s  %-30s  %-9s  %s\n", "ID", "AMOUNT", "DESCRIPTION", "RECURRING", "NEXT")
        fmt.Printf("%-36s  %10s  %-30s  %-9s  %s\n", "------------------------------------", "----------", "------------------------------", "---------", "----")
        for _, t := range txns {
            amount := fmt.Sprintf("%.2f", float64(t.Amount)/100.0)
            rec := "no"
            if t.IsRecurring {
                rec = "yes"
            }
            next := ""
            if t.NextOccurrence != nil {
                next = t.NextOccurrence.Format("2006-01-02")
            }
            desc := t.Description
            if len(desc) > 30 {
                desc = desc[:27] + "..."
            }
            fmt.Printf("%-36s  %10s  %-30s  %-9s  %s\n", t.ID.String(), amount, desc, rec, next)
        }
        return nil
    },
}

var txAddCmd = &cobra.Command{
    Use:   "add",
    Short: "Add a transaction",
    RunE: func(cmd *cobra.Command, args []string) error {
        amountFloat, _ := cmd.Flags().GetFloat64("amount")
        description, _ := cmd.Flags().GetString("description")
        category, _ := cmd.Flags().GetString("category")
        isRecurring, _ := cmd.Flags().GetBool("recurring")
        frequency, _ := cmd.Flags().GetString("frequency")
        anchorStr, _ := cmd.Flags().GetString("anchor")
        accountStr, _ := cmd.Flags().GetString("account")

        amountCents := int64(math.Round(amountFloat * 100))

        // Resolve account.
        var accountID uuid.UUID
        if accountStr != "" {
            id, err := uuid.Parse(accountStr)
            if err != nil {
                return fmt.Errorf("invalid account ID: %w", err)
            }
            accountID = id
        } else {
            acc, err := application.AccountsSvc.GetDefault()
            if err != nil {
                return fmt.Errorf("failed to get default account (use --account to specify): %w", err)
            }
            accountID = acc.ID
        }

        t := sqlite.Transaction{
            ID:          uuid.New(),
            AccountID:   accountID,
            Amount:      amountCents,
            Description: description,
            Category:    category,
            IsRecurring: isRecurring,
        }

        if isRecurring {
            if frequency == "" || anchorStr == "" {
                return fmt.Errorf("frequency and anchor are required for recurring transactions")
            }
            t.Frequency = &frequency

            parsed, err := time.Parse("2006-01-02", anchorStr)
            if err != nil {
                return fmt.Errorf("invalid anchor date (expected YYYY-MM-DD): %w", err)
            }
            anchor := time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
            t.AnchorDate = &anchor
        }

        if err := application.TxnsSvc.CreateTransaction(t); err != nil {
            return fmt.Errorf("failed to create transaction: %w", err)
        }
        fmt.Printf("Transaction created: %s\n", t.ID.String())
        return nil
    },
}

var txUpdateCmd = &cobra.Command{
    Use:   "update <id>",
    Short: "Update a transaction",
    Args:  cobra.ExactArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        id, err := uuid.Parse(args[0])
        if err != nil {
            return fmt.Errorf("invalid transaction ID: %w", err)
        }

        upd := sqlite.UpdateTransaction{}
        if cmd.Flags().Changed("description") {
            d, _ := cmd.Flags().GetString("description")
            upd.Description = &d
        }
        if cmd.Flags().Changed("category") {
            c, _ := cmd.Flags().GetString("category")
            upd.Category = &c
        }
        if cmd.Flags().Changed("amount") {
            a, _ := cmd.Flags().GetFloat64("amount")
            cents := int64(math.Round(a * 100))
            upd.Amount = &cents
        }

        if err := application.TxnsSvc.UpdateTransaction(id, upd); err != nil {
            return fmt.Errorf("failed to update transaction: %w", err)
        }
        fmt.Println("Transaction updated")
        return nil
    },
}

var txDeleteCmd = &cobra.Command{
    Use:   "delete <id>",
    Short: "Delete a transaction",
    Args:  cobra.ExactArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        id, err := uuid.Parse(args[0])
        if err != nil {
            return fmt.Errorf("invalid transaction ID: %w", err)
        }
        if err := application.TxnsSvc.DeleteTransaction(id); err != nil {
            return fmt.Errorf("failed to delete transaction: %w", err)
        }
        fmt.Println("Transaction deleted")
        return nil
    },
}

func init() {
    txListCmd.Flags().String("account", "", "account ID to list transactions for (defaults to default account)")

    txAddCmd.Flags().Float64("amount", 0, "amount in decimal dollars, negative for debits (e.g., -850.00)")
    txAddCmd.Flags().String("description", "", "transaction description")
    txAddCmd.Flags().String("category", "", "transaction category")
    txAddCmd.Flags().Bool("recurring", false, "mark as recurring")
    txAddCmd.Flags().String("frequency", "", "recurrence frequency: weekly, bi-weekly, monthly, yearly")
    txAddCmd.Flags().String("anchor", "", "anchor date for recurrence in YYYY-MM-DD format")
    txAddCmd.Flags().String("account", "", "account ID (defaults to default account)")

    txUpdateCmd.Flags().Float64("amount", 0, "new amount in decimal dollars")
    txUpdateCmd.Flags().String("description", "", "new description")
    txUpdateCmd.Flags().String("category", "", "new category")

    txCmd.AddCommand(txListCmd, txAddCmd, txUpdateCmd, txDeleteCmd)
    rootCmd.AddCommand(txCmd)
}
```

**Step 2: Verify build**

Run `go build ./cmd/cibi/`. Fix any compilation errors. Pay attention to import paths using `github.com/ufleck/cibi`.
</action>
```

---

### Task 03-04: `cibi check` command with lipgloss output

**Files Modified:** `cmd/cibi/check.go` (new)
**Requirements:** CLI-04

```
<read_first>
- cmd/cibi/root.go (application variable; understand PersistentPreRunE flow)
- internal/service/engine.go (EngineService.CanIBuyItDefault signature: takes int64 cents, returns EngineResult; EngineResult fields: CanBuy bool, PurchasingPower int64, BufferRemaining int64, RiskLevel string)
- cmd/cibi/tx.go (amount parsing pattern: float64 flag → int64(math.Round(amount * 100)))
</read_first>

<acceptance_criteria>
- [ ] `cmd/cibi/check.go` exists with `package main`
- [ ] `checkCmd` uses `cobra.ExactArgs(1)` — requires exactly one positional argument (amount as decimal dollars)
- [ ] Amount parsed from `args[0]` using `strconv.ParseFloat(args[0], 64)` then converted: `cents = int64(math.Round(amount * 100))`
- [ ] Invalid amount (non-numeric string) returns user-friendly error: `"invalid amount: <error>"`
- [ ] Calls `application.EngineSvc.CanIBuyItDefault(cents)`
- [ ] Output when `CanBuy == true`: verdict line shows "YES" styled green; output includes purchasing power, buffer remaining, and risk level
- [ ] Output when `CanBuy == false`: verdict line shows "NO" styled red; output includes purchasing power (may be negative), buffer remaining (may be negative), and risk level "BLOCKED"
- [ ] Purchasing power and buffer remaining displayed as decimal dollars (cents/100.0, 2 decimal places)
- [ ] lipgloss used for at least the verdict coloring: green for YES (`lipgloss.Color("10")`), red for NO (`lipgloss.Color("9")`)
- [ ] `go build ./cmd/cibi/` succeeds
- [ ] `time ./cibi check 75` completes in under 100ms on a populated database (measured manually during verification; binary must not start an HTTP server)
- [ ] `checkCmd` registered on `rootCmd` in `init()`
</acceptance_criteria>

<action>
**Step 1: Create `cmd/cibi/check.go`**

```go
package main

import (
    "fmt"
    "math"
    "strconv"

    "github.com/charmbracelet/lipgloss"
    "github.com/spf13/cobra"
)

var checkCmd = &cobra.Command{
    Use:   "check <amount>",
    Short: "Check if you can afford a purchase",
    Long:  "Checks if you can buy an item at the given price (in decimal dollars) using the default account.",
    Args:  cobra.ExactArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        amount, err := strconv.ParseFloat(args[0], 64)
        if err != nil {
            return fmt.Errorf("invalid amount: %w", err)
        }
        cents := int64(math.Round(amount * 100))

        result, err := application.EngineSvc.CanIBuyItDefault(cents)
        if err != nil {
            return fmt.Errorf("engine error: %w", err)
        }

        // Styles
        yesStyle := lipgloss.NewStyle().
            Bold(true).
            Foreground(lipgloss.Color("10")) // bright green

        noStyle := lipgloss.NewStyle().
            Bold(true).
            Foreground(lipgloss.Color("9")) // bright red

        labelStyle := lipgloss.NewStyle().
            Foreground(lipgloss.Color("8")) // gray

        // Verdict
        if result.CanBuy {
            fmt.Println(yesStyle.Render("YES — you can afford it"))
        } else {
            fmt.Println(noStyle.Render("NO — insufficient funds"))
        }

        fmt.Printf("%s $%.2f\n", labelStyle.Render("Purchasing power:"), float64(result.PurchasingPower)/100.0)
        fmt.Printf("%s $%.2f\n", labelStyle.Render("Buffer remaining: "), float64(result.BufferRemaining)/100.0)
        fmt.Printf("%s %s\n", labelStyle.Render("Risk level:      "), result.RiskLevel)
        return nil
    },
}

func init() {
    rootCmd.AddCommand(checkCmd)
}
```

**Step 2: Build and verify**

Run `go build -o cibi.exe ./cmd/cibi/` from project root.

Verify the binary exists and `./cibi.exe --help` shows `check`, `account`, and `tx` subcommands.

For WARNING 6 timing verification, after seeding test data, run:
```
time ./cibi.exe check 75
```
On Windows PowerShell: `Measure-Command { ./cibi.exe check 75 }`. The TotalMilliseconds value must be under 100ms.
</action>
```

---

## Verification

### Wave 1 Verification

```bash
# 1. Build succeeds
go build ./...

# 2. CLI binary builds
go build -o cibi.exe ./cmd/cibi/

# 3. Help output shows all commands
./cibi.exe --help
./cibi.exe account --help
./cibi.exe tx --help
./cibi.exe check --help

# 4. Success Criteria 1: cibi check delivers verdict without server
./cibi.exe check 75
# Expected output: YES or NO verdict + purchasing power + buffer remaining + risk level
# Timing (Unix): time ./cibi.exe check 75
# Timing (PowerShell): Measure-Command { ./cibi.exe check 75 } | Select-Object TotalMilliseconds

# 5. Success Criteria 2: recurring transaction round-trip
./cibi.exe tx add --recurring --frequency monthly --anchor 2024-03-01 --amount -850.00 --description "Rent"
./cibi.exe tx list
# Expected: row showing Rent, -850.00, recurring=yes, next=2024-03-01

# 6. Success Criteria 3: account listing with decimal formatting
./cibi.exe account list
# Expected: balance shown as decimal (e.g., 1500.00 not 150000)
# Seed a second account and set it as default:
./cibi.exe account add --name "Savings" --balance 500000 --currency USD
# Capture the UUID from output, then:
./cibi.exe account set-default <uuid>
./cibi.exe account list
# Expected: Savings account marked with *

# 7. Success Criteria 4: --config flag
./cibi.exe --config /path/to/test-config.yaml check 50
# Expected: uses database_path and safety_buffer from the specified file

# 8. AccountsSvc wired in App
grep -n "AccountsSvc" internal/app/app.go
# Expected: two matches — struct field and return statement

# 9. SafetyBuffer default updated
grep "SafetyBuffer" internal/config/config.go
# Expected: viper.SetDefault("SafetyBuffer", 1000)

# 10. No HTTP server started by CLI (confirm: binary exits after command completes)
# cibi check 75 should exit cleanly, not block waiting for connections
```

### Success Criteria (from ROADMAP.md)

1. `cibi check 75` prints a verdict (YES/NO), purchasing power, buffer remaining, and risk level within 100ms — no HTTP server running required
2. `cibi tx add --recurring --frequency monthly --anchor 2024-03-01 --amount -850.00 --description "Rent"` creates a recurring transaction and subsequent `cibi tx list` shows it with the correct next occurrence date
3. `cibi account list` shows all accounts with balances formatted as decimal currency (not raw cents); `cibi account set-default <id>` changes which account the engine queries
4. `cibi --config /path/to/config.yaml check 50` loads the specified config file and uses its safety buffer and database path values

---

## Files Modified Summary

| File | Action |
|------|--------|
| `internal/service/accounts.go` | CREATE — AccountsService wrapping AccountsRepo |
| `internal/app/app.go` | MODIFY — add AccountsSvc field + wire in New() |
| `internal/config/config.go` | MODIFY — SafetyBuffer default 0 → 1000 |
| `cmd/cibi/main.go` | CREATE — thin bootstrap calling Execute() |
| `cmd/cibi/root.go` | CREATE — rootCmd, PersistentPreRunE, --config/--db flags |
| `cmd/cibi/account.go` | CREATE — account list/add/set-default/delete subcommands |
| `cmd/cibi/tx.go` | CREATE — tx list/add/update/delete subcommands |
| `cmd/cibi/check.go` | CREATE — check command with lipgloss verdict output |
| `go.mod` / `go.sum` | MODIFY — add cobra and lipgloss dependencies |

---

## Decision Coverage Matrix

| Decision | Task | Status | Notes |
|----------|------|--------|-------|
| D-01 (separate cmd/cibi/) | 03-02 | Full | cmd/cibi/ created |
| D-02 (root at cmd/cibi/main.go) | 03-02 | Full | main.go calls Execute() |
| D-03 (PersistentPreRunE) | 03-02 | Full | Full Viper loading sequence |
| D-04 (--config flag) | 03-02 | Full | viper.SetConfigFile path |
| D-05 (--db flag) | 03-02 | Full | BindPFlag to DatabasePath |
| D-06 (Viper priority) | 03-02 | Full | flags > env > file > defaults |
| D-07 (Config struct fields) | 03-01 | Full | Existing Config unchanged |
| D-08 (SafetyBuffer=1000 default) | 03-01 | Full | LoadConfig updated; root.go also sets inline default |
| D-09 (account subcommands) | 03-02 | Full | list/add/set-default/delete |
| D-10 (tx subcommands) | 03-03 | Full | list/add/update/delete |
| D-11 (tx add flags) | 03-03 | Full | --recurring/--frequency/--anchor validated |
| D-12 (check → CanIBuyItDefault) | 03-04 | Full | No HTTP call |
| D-13 (services via App struct) | 03-01 | Full | AccountsSvc added to App |
| D-14 (separate App instance) | 03-02 | Full | app.New(cfg) in PersistentPreRunE |
| D-15 (no business logic in CLI) | all | Full | All logic delegated to services |
| D-16 (decimal balance output) | 03-02 | Full | fmt.Sprintf("%.2f", cents/100.0) |
| D-17 (check output fields) | 03-04 | Full | verdict + pp + buffer + risk |
| D-18 (lipgloss) | 03-04 | Full | lipgloss colors on verdict |
| D-19 (user-friendly errors) | all | Full | fmt.Errorf with context |
| D-20 (exit codes) | 03-02 | Full | os.Exit(1) on Execute error |
| D-21 (validation error messages) | 03-03 | Full | "frequency and anchor required..." |
| D-22 (confirmation feedback) | all | Full | "Account created: <uuid>" etc |

---

## must_haves

**Goal:** Every domain operation is accessible from the terminal; `cibi check <amount>` delivers the verdict instantly without a running server.

**Truths — what must be observable:**
- Running `./cibi check 75` exits cleanly and prints YES or NO, a dollar amount for purchasing power, a dollar amount for buffer remaining, and a risk level string (LOW/MEDIUM/HIGH/BLOCKED)
- Running `./cibi check 75` completes in under 100ms with no HTTP server process started
- Running `./cibi tx add --recurring --frequency monthly --anchor 2024-03-01 --amount -850.00 --description "Rent"` exits 0 and a subsequent `./cibi tx list` shows the Rent transaction with `next=2024-03-01` and `recurring=yes`
- Running `./cibi account list` shows balances as decimal dollars (e.g., `1500.00` not `150000`)
- Running `./cibi account set-default <uuid>` changes which account is marked `*` in subsequent `account list`
- Running `./cibi --config /tmp/test.yaml check 50` reads database_path and safety_buffer from the YAML file

**Artifacts — what must exist:**
- `cmd/cibi/main.go` — binary entry point
- `cmd/cibi/root.go` — rootCmd with PersistentPreRunE loading Viper config into `*app.App`
- `cmd/cibi/account.go` — account list/add/set-default/delete commands
- `cmd/cibi/tx.go` — tx list/add/update/delete commands
- `cmd/cibi/check.go` — check command invoking EngineService.CanIBuyItDefault
- `internal/service/accounts.go` — AccountsService wrapping AccountsRepo
- `internal/app/app.go` — contains `AccountsSvc *service.AccountsService` field wired in New()

**Key links — where breakage would cause cascading failure:**
- `root.go PersistentPreRunE` → `app.New(cfg)` → `AccountsSvc, TxnsSvc, EngineSvc` all populated before any subcommand runs
- `check.go` → `application.EngineSvc.CanIBuyItDefault(cents)` — must not be nil (requires PersistentPreRunE to have run)
- `account.go / tx.go` → `application.AccountsSvc / TxnsSvc` — nil if PersistentPreRunE is skipped or fails silently
- `--config` flag → `viper.SetConfigFile()` → must be evaluated before `viper.ReadInConfig()` — order matters in root.go
- `--amount` decimal input → `int64(math.Round(float64 * 100))` → cents stored in DB — incorrect conversion produces wrong storage values
