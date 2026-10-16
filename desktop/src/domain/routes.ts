// Port of the route table in internal/handler/routes.go. Each slice registers its own routes.
// Only the routes of the slices ported so far are registered.

import type { App } from './app'
import { registerAccountsRoutes } from './handlers/accounts'
import { registerCategoriesRoutes } from './handlers/categories'
import { registerCheckRoutes } from './handlers/check'
import { registerFriendRoutes } from './handlers/friend'
import { registerGoalsRoutes } from './handlers/goals'
import { registerGroupEventRoutes } from './handlers/groupEvent'
import { registerLedgerRoutes } from './handlers/ledger'
import { registerPayScheduleRoutes } from './handlers/paySchedule'
import { registerPeerDebtRoutes } from './handlers/peerDebt'
import { registerProfileRoutes } from './handlers/profile'
import { registerSettingsRoutes } from './handlers/settings'
import { registerTransactionsRoutes } from './handlers/transactions'

export function registerRoutes(app: App): void {
  registerAccountsRoutes(app)
  registerLedgerRoutes(app)
  registerPayScheduleRoutes(app)
  registerProfileRoutes(app)
  registerSettingsRoutes(app)
  registerTransactionsRoutes(app)
  registerFriendRoutes(app)
  registerPeerDebtRoutes(app)
  registerGroupEventRoutes(app)
  registerGoalsRoutes(app)
  registerCheckRoutes(app)
  registerCategoriesRoutes(app)
}
