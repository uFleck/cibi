---
status: investigating
trigger: "non-recurring transactions aren't being deducted from my account's balance on creation"
created: "2026-04-14"
updated: "2026-04-14"
resolution:
  root_cause: "CreateTransaction in internal/service/transactions.go only inserts the transaction but never adjusts the account balance"
  fix: not applied
  verification: 
  files_changed: []
specialist_review: none
---

# Symptoms

- **Expected behavior**: When a non-recurring transaction is created, it should immediately reduce the account's balance by the transaction amount
- **Actual behavior**: The balance stays the same / doesn't change when creating a non-recurring transaction
- **Error messages**: No error messages - just wrong behavior
- **Timeline**: Not specified - user noticed it doesn't work
- **Reproduction**: Create a non-recurring transaction and check account balance

# Current Focus

- hypothesis: "CreateTransaction in internal/service/transactions.go only inserts the transaction but never adjusts the account balance"
- test: "Create a non-recurring transaction and verify account balance decreases"
- expecting: "Account balance decreases by transaction amount"
- next_action: "plan fix with /gsd-plan-phase --gaps"
- specialist_hint: "go"