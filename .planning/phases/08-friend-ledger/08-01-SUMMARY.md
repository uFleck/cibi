---
phase: 08-friend-ledger
plan: "01"
subsystem: backend-data-layer
tags: [go, sqlite, migration, repo, service, friend-ledger]
dependency_graph:
  requires: []
  provides:
    - FriendRepo interface + SqliteFriendRepo
    - PeerDebtRepo interface + SqlitePeerDebtRepo
    - GroupEventRepo interface + SqliteGroupEventRepo
    - FriendService
    - PeerDebtService
    - GroupEventService
    - goose migration 20260414000002
  affects:
    - internal/service/engine.go (peerDebtRepo added)
    - internal/app/app.go (three new services wired)
tech_stack:
  added: []
  patterns:
    - interface-driven repo (FriendRepo, PeerDebtRepo, GroupEventRepo)
    - uuid-as-string scanning pattern (uuid.Parse from TEXT column)
    - sql.NullString / sql.NullInt64 for nullable columns
    - crypto/rand + encoding/hex for public token generation (128-bit entropy)
    - SetParticipants: DELETE + INSERT in single tx (idempotent replace)
key_files:
  created:
    - internal/migrations/20260414000002_friend_ledger.go
    - internal/repo/sqlite/friend.go
    - internal/repo/sqlite/peer_debt.go
    - internal/repo/sqlite/group_event.go
    - internal/service/token.go
    - internal/service/friend.go
    - internal/service/peer_debt.go
    - internal/service/group_event.go
  modified:
    - internal/service/engine.go
    - internal/app/app.go
decisions:
  - generatePublicToken placed in internal/service/token.go (package-level unexported) so both FriendService and GroupEventService share it without duplication
  - SumUpcomingPeerObligations uses two separate SQL queries (lump-sum + installment) summed in Go — avoids a complex UNION query
  - SetParticipants does DELETE + INSERT in a single transaction for idempotent participant replacement
  - peerObligations folded into CanIBuyIt formula: purchasingPower = balance + obligations + peerObligations - minThreshold
metrics:
  duration: ~25m
  completed: "2026-04-14"
  tasks_completed: 3
  files_created: 8
  files_modified: 2
---

# Phase 08 Plan 01: Friend Ledger — Data Layer Summary

Data layer for all four Friend Ledger entities: one goose migration, three repo files, three service files, token helper, engine update, and app.go wiring — all compiling cleanly with `go build ./...` and `go vet ./...`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Goose migration — four new tables | 3f34b7a | internal/migrations/20260414000002_friend_ledger.go |
| 2 | Repo layer — FriendRepo, PeerDebtRepo, GroupEventRepo | a56776c | internal/repo/sqlite/friend.go, peer_debt.go, group_event.go |
| 3 | Service layer + app.go wiring | 40bf565 | internal/service/{token,friend,peer_debt,group_event,engine}.go, internal/app/app.go |

## Interface Signatures (for Plan 08-02 reference)

### FriendRepo (internal/repo/sqlite/friend.go)
```go
type FriendRepo interface {
    Insert(f Friend) error
    GetAll() ([]Friend, error)
    GetByID(id uuid.UUID) (Friend, error)
    GetByToken(token string) (Friend, error)
    Update(id uuid.UUID, name *string, notes *string) error
    DeleteByID(id uuid.UUID) error
}
type Friend struct {
    ID          uuid.UUID
    Name        string
    PublicToken string
    Notes       *string
}
```

### PeerDebtRepo (internal/repo/sqlite/peer_debt.go)
```go
type PeerDebtRepo interface {
    Insert(d PeerDebt) error
    GetByFriend(friendID uuid.UUID) ([]PeerDebt, error)
    GetAll() ([]PeerDebt, error)
    GetByID(id uuid.UUID) (PeerDebt, error)
    Update(id uuid.UUID, amount *int64, description *string, isConfirmed *bool, paidInstallments *int64) error
    DeleteByID(id uuid.UUID) error
    GetBalanceByFriend(friendID uuid.UUID) (PeerDebtBalance, error)
    GetGlobalBalance() (GlobalPeerBalance, error)
    SumUpcomingPeerObligations() (int64, error)
}
type PeerDebt struct {
    ID uuid.UUID; FriendID uuid.UUID; Amount int64; Description string; Date string
    IsInstallment bool; TotalInstallments *int64; PaidInstallments int64
    Frequency *string; AnchorDate *string; IsConfirmed bool
}
type PeerDebtBalance struct { FriendOwesUser int64; UserOwesFriend int64; Net int64 }
type GlobalPeerBalance struct { TotalOwedToUser int64; TotalUserOwes int64; Net int64 }
```

### GroupEventRepo (internal/repo/sqlite/group_event.go)
```go
type GroupEventRepo interface {
    Insert(e GroupEvent) error
    GetAll() ([]GroupEvent, error)
    GetByID(id uuid.UUID) (GroupEvent, error)
    GetByToken(token string) (GroupEvent, error)
    Update(id uuid.UUID, title *string, date *string, totalAmount *int64, notes *string) error
    DeleteByID(id uuid.UUID) error
    SetParticipants(eventID uuid.UUID, participants []GroupEventParticipant) error
    GetParticipants(eventID uuid.UUID) ([]GroupEventParticipant, error)
}
type GroupEvent struct {
    ID uuid.UUID; Title string; Date string; TotalAmount int64; PublicToken string; Notes *string
}
type GroupEventParticipant struct {
    EventID uuid.UUID; FriendID *uuid.UUID; ShareAmount int64; IsConfirmed bool
}
```

### Service Constructors
```go
func NewFriendService(repo sqlite.FriendRepo) *FriendService
func NewPeerDebtService(repo sqlite.PeerDebtRepo) *PeerDebtService
func NewGroupEventService(repo sqlite.GroupEventRepo, friendRepo sqlite.FriendRepo) *GroupEventService
func NewEngineService(accRepo, txnsRepo, psRepo, bufferRepo, peerDebtRepo) *EngineService
```

### App struct new fields
```go
FriendSvc     *service.FriendService
PeerDebtSvc   *service.PeerDebtService
GroupEventSvc *service.GroupEventService
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are fully implemented at the repo and service layer. Handlers (Plan 08-02) will wire these services to HTTP endpoints.

## Threat Flags

None — all mitigations from the plan threat model were applied:
- T-08-01-01: Amount stored as signed INTEGER, no float coercion
- T-08-01-02: Partial unique index `idx_gep_host` present in migration DDL
- T-08-01-03: Token uses `crypto/rand` 16 bytes = 128-bit entropy

## Self-Check: PASSED

All 8 created files exist on disk. All 3 task commits (3f34b7a, a56776c, 40bf565) found in git log. `go build ./...` and `go vet ./...` exit 0.
