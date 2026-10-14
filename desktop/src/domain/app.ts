// Port of internal/app/app.go: wires repos and services for the in-process app.
//
// Only what exists so far is built. Later slices add their repos and services here, in the
// same order as the Go New(): repos first, then the services that take them.
//
// The routes read their db through getDb() (set by setDb / initDb). Keep app.db the same
// handle as the one passed to setDb.

import type { Db } from './db'
import { DEFAULT_CONFIG, type Config } from './config'
import { LedgerService } from './service/ledger'
import { AccountsService } from './service/accounts'
import { ProfileService } from './service/profile'
import { PayScheduleService } from './service/paySchedule'
import { SqliteAccountsRepo, type AccountsRepo } from './repo/accounts'
import { SqliteLedgerRepo, type LedgerRepo } from './repo/ledger'
import { SqliteProfileRepo, type ProfileRepo } from './repo/profile'
import { SqlitePayScheduleRepo, type PayScheduleRepo } from './repo/paySchedule'

export interface App {
  db: Db
  config: Config
  accountsRepo: AccountsRepo
  ledgerRepo: LedgerRepo
  psRepo: PayScheduleRepo
  profileRepo: ProfileRepo
  ledgerSvc: LedgerService
  accountsSvc: AccountsService
  payScheduleSvc: PayScheduleService
  profileSvc: ProfileService
}

export function buildApp(db: Db, config: Partial<Config> = {}): App {
  const accountsRepo = new SqliteAccountsRepo(db)
  const psRepo = new SqlitePayScheduleRepo(db)
  const ledgerRepo = new SqliteLedgerRepo(db)
  const ledgerSvc = new LedgerService(db, ledgerRepo, accountsRepo)
  const accountsSvc = new AccountsService(accountsRepo, ledgerSvc)
  const payScheduleSvc = new PayScheduleService(db, psRepo, accountsRepo, ledgerSvc)
  const profileRepo = new SqliteProfileRepo(db)
  const profileSvc = new ProfileService(profileRepo)
  return {
    db,
    config: { ...DEFAULT_CONFIG, ...config },
    accountsRepo,
    ledgerRepo,
    psRepo,
    profileRepo,
    ledgerSvc,
    accountsSvc,
    payScheduleSvc,
    profileSvc,
  }
}
