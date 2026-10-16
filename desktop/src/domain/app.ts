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
import { TransactionsService } from './service/transactions'
import { ProfileService } from './service/profile'
import { PayScheduleService } from './service/paySchedule'
import { FriendService } from './service/friend'
import { PeerDebtService } from './service/peerDebt'
import { GroupEventService } from './service/groupEvent'
import { GoalsService } from './service/goals'
import { CategoriesService } from './service/categories'
import { EngineService } from './service/engine'
import { SqliteAccountsRepo, type AccountsRepo } from './repo/accounts'
import { SqliteLedgerRepo, type LedgerRepo } from './repo/ledger'
import { SqliteProfileRepo, type ProfileRepo } from './repo/profile'
import { SqlitePayScheduleRepo, type PayScheduleRepo } from './repo/paySchedule'
import { SqliteTxnsRepo, type TransactionsRepo } from './repo/transactions'
import { SqliteFriendRepo, type FriendRepo } from './repo/friend'
import { SqlitePeerDebtRepo, type PeerDebtRepo } from './repo/peerDebt'
import { SqliteGroupEventRepo, type GroupEventRepo } from './repo/groupEvent'
import { SqliteGoalsRepo, type GoalsRepo } from './repo/goals'
import { AppSettingService } from './service/appSetting'
import { SqliteAppSettingRepo, type AppSettingRepo } from './repo/appSetting'

export interface App {
  db: Db
  config: Config
  accountsRepo: AccountsRepo
  txnsRepo: TransactionsRepo
  ledgerRepo: LedgerRepo
  psRepo: PayScheduleRepo
  friendRepo: FriendRepo
  peerDebtRepo: PeerDebtRepo
  groupEventRepo: GroupEventRepo
  profileRepo: ProfileRepo
  goalsRepo: GoalsRepo
  appSettingRepo: AppSettingRepo
  ledgerSvc: LedgerService
  accountsSvc: AccountsService
  txnsSvc: TransactionsService
  payScheduleSvc: PayScheduleService
  friendSvc: FriendService
  peerDebtSvc: PeerDebtService
  groupEventSvc: GroupEventService
  profileSvc: ProfileService
  goalsSvc: GoalsService
  engineSvc: EngineService
  settingSvc: AppSettingService
  categoriesSvc: CategoriesService
}

export function buildApp(db: Db, config: Partial<Config> = {}): App {
  const accountsRepo = new SqliteAccountsRepo(db)
  const txnsRepo = new SqliteTxnsRepo(db)
  const psRepo = new SqlitePayScheduleRepo(db)
  const friendRepo = new SqliteFriendRepo(db)
  const peerDebtRepo = new SqlitePeerDebtRepo(db)
  const groupEventRepo = new SqliteGroupEventRepo(db)
  const ledgerRepo = new SqliteLedgerRepo(db)
  const ledgerSvc = new LedgerService(db, ledgerRepo, accountsRepo)
  const accountsSvc = new AccountsService(accountsRepo, ledgerSvc)
  const txnsSvc = new TransactionsService(db, txnsRepo, accountsRepo, ledgerSvc)
  const goalsRepo = new SqliteGoalsRepo(db)
  const goalsSvc = new GoalsService(db, goalsRepo, accountsRepo, ledgerSvc)
  const engineSvc = new EngineService(accountsRepo, txnsRepo, psRepo, peerDebtRepo, groupEventRepo, goalsRepo)
  const payScheduleSvc = new PayScheduleService(db, psRepo, accountsRepo, ledgerSvc)
  const friendSvc = new FriendService(friendRepo)
  const peerDebtSvc = new PeerDebtService(peerDebtRepo)
  const groupEventSvc = new GroupEventService(groupEventRepo, friendRepo)
  const profileRepo = new SqliteProfileRepo(db)
  const profileSvc = new ProfileService(profileRepo)
  const appSettingRepo = new SqliteAppSettingRepo(db)
  const settingSvc = new AppSettingService(appSettingRepo)
  const categoriesSvc = new CategoriesService(db, txnsRepo)
  return {
    db,
    config: { ...DEFAULT_CONFIG, ...config },
    accountsRepo,
    txnsRepo,
    ledgerRepo,
    psRepo,
    friendRepo,
    peerDebtRepo,
    groupEventRepo,
    profileRepo,
    goalsRepo,
    appSettingRepo,
    ledgerSvc,
    accountsSvc,
    txnsSvc,
    payScheduleSvc,
    friendSvc,
    peerDebtSvc,
    groupEventSvc,
    profileSvc,
    goalsSvc,
    engineSvc,
    settingSvc,
    categoriesSvc,
  }
}
