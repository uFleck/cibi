import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { PlanPage } from '@/pages/plan'
import { StatementPage } from '@/pages/statement'
import { DebtsPage } from '@/pages/debts'
import { SettingsPage } from '@/pages/settings'
import { RootLayout } from '@/App'

const rootRoute = createRootRoute({ component: RootLayout })

const planRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: PlanPage })
const statementRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extrato', component: StatementPage })
const debtsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/amigos', component: DebtsPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/ajustes', component: SettingsPage })

/** Old bookmarks and links keep working. */
function legacy(to: '/' | '/extrato' | '/amigos' | '/ajustes') {
  return () => {
    throw redirect({ to })
  }
}

const legacyRoutes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/widgets', beforeLoad: legacy('/') }),
  createRoute({ getParentRoute: () => rootRoute, path: '/goals', beforeLoad: legacy('/') }),
  createRoute({ getParentRoute: () => rootRoute, path: '/categories', beforeLoad: legacy('/') }),
  createRoute({ getParentRoute: () => rootRoute, path: '/transactions', beforeLoad: legacy('/extrato') }),
  createRoute({ getParentRoute: () => rootRoute, path: '/accounts', beforeLoad: legacy('/ajustes') }),
  createRoute({ getParentRoute: () => rootRoute, path: '/friends', beforeLoad: legacy('/amigos') }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', beforeLoad: legacy('/ajustes') }),
]

const routeTree = rootRoute.addChildren([
  planRoute,
  statementRoute,
  debtsRoute,
  settingsRoute,
  ...legacyRoutes,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
