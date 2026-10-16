import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AccountsPage } from '@/pages/accounts'
import { TransactionsPage } from '@/pages/transactions'
import { FriendsPage } from '@/pages/friends'
import { SettingsPage } from '@/pages/settings'
import { GoalsPage } from '@/pages/goals'
import { CategoriesPage } from '@/pages/categories'
import { OverviewPage } from '@/pages/overview'
import { RootLayout } from '@/App'

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: OverviewPage,
})
const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accounts',
  component: AccountsPage,
})
const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transactions',
  component: TransactionsPage,
  validateSearch: (search: Record<string, unknown>): { select?: string; tab?: string } => ({
    select: typeof search.select === 'string' ? search.select : undefined,
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
})
const friendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends',
  component: FriendsPage,
})
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})
const goalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/goals',
  component: GoalsPage,
})

const categoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/categories',
  component: CategoriesPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  accountsRoute,
  transactionsRoute,
  friendsRoute,
  settingsRoute,
  goalsRoute,
  categoriesRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
