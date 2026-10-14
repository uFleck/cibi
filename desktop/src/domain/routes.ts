// Port of the route table in internal/handler/routes.go. Each slice registers its own routes.
// Only the routes of the slices ported so far are registered.

import type { App } from './app'
import { registerAccountsRoutes } from './handlers/accounts'
import { registerLedgerRoutes } from './handlers/ledger'
import { registerPayScheduleRoutes } from './handlers/paySchedule'
import { registerProfileRoutes } from './handlers/profile'

export function registerRoutes(app: App): void {
  registerAccountsRoutes(app)
  registerLedgerRoutes(app)
  registerPayScheduleRoutes(app)
  registerProfileRoutes(app)
}
