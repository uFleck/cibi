/* eslint-disable react-refresh/only-export-components */
import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useEffect, useContext } from 'react'
import { Plus, ArrowDown } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { StatCards } from '@/components/StatCards'
import { PayWindowBar } from '@/components/PayWindowBar'
import { CheckWidget } from '@/components/CheckWidget'
import { ObligationsList } from '@/components/ObligationsList'
import { PayScheduleList } from '@/components/PayScheduleList'
import { ProjectionWidget } from '@/components/ProjectionWidget'
import { FriendLedgerWidget } from '@/components/FriendLedgerWidget'
import { GoalsSnapshotWidget } from '@/components/GoalsSnapshotWidget'
import { LedgerRecentWidget } from '@/components/LedgerRecentWidget'
import { AccountsPage } from '@/pages/accounts'
import { TransactionsPage } from '@/pages/transactions'
import { FriendsPage } from '@/pages/friends'
import { SettingsPage } from '@/pages/settings'
import { GoalsPage } from '@/pages/goals'
import { FriendPublicPage } from '@/pages/friend-public'
import { GroupPublicPage } from '@/pages/group-public'
import { fetchDefaultAccount, fetchAccounts, fetchTransactions, listPaySchedules, fetchFriendBreakdown } from '@/lib/api'
import { AccountContext, RootLayout } from '@/App'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  )
}

function Dashboard() {
  const { selectedAccountId } = useContext(AccountContext)

  const {
    data: allAccounts = [],
    isLoading: accountsLoading,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const defaultAccount = allAccounts.find(a => a.is_default)
  const currentAccountId = selectedAccountId || defaultAccount?.id

  const {
    data: account,
    isError: accountError,
  } = useQuery({
    queryKey: ['account', currentAccountId],
    queryFn: () => {
      if (!currentAccountId) return fetchDefaultAccount()
      return Promise.resolve(allAccounts.find(a => a.id === currentAccountId)!)
    },
    enabled: !!currentAccountId || !allAccounts.length,
  })

  const {
    data: transactions = [],
    isError: txnsError,
  } = useQuery({
    queryKey: ['transactions', account?.id],
    queryFn: () => fetchTransactions(account!.id),
    enabled: !!account?.id,
  })

  const {
    data: paySchedules = [],
  } = useQuery({
    queryKey: ['pay-schedules', account?.id],
    queryFn: () => listPaySchedules(account!.id),
    enabled: !!account?.id,
  })

  const {
    data: friendBreakdown = [],
  } = useQuery({
    queryKey: ['friend-breakdown', account?.id],
    queryFn: () => fetchFriendBreakdown(account!.id),
    enabled: !!account?.id,
  })

  const nextPayday = paySchedules.length > 0
    ? paySchedules.reduce((earliest, ps) =>
        ps.next_payday < earliest ? ps.next_payday : earliest,
        paySchedules[0].next_payday
      )
    : null

  useEffect(() => {
    if (accountError || txnsError) {
      toast.error('Could not load financial data. Retrying in 30 seconds.')
    }
  }, [accountError, txnsError])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
      {!accountsLoading && allAccounts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">Create your first account to get started</p>
            <Link to="/accounts">
              <Button size="sm">
                <Plus size={16} />
                Create Account
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Skeleton
          name="dashboard"
          loading={!account}
          fallback={
            <div className="flex flex-col gap-4" role="status" aria-label="Loading dashboard">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-[88px] rounded-xl bg-card/60 animate-pulse border border-border/40" />
                ))}
              </div>
              <div className="h-[76px] rounded-xl bg-card/60 animate-pulse border border-border/40" />
              <div className="h-[120px] rounded-xl bg-card/60 animate-pulse border border-border/40" />
              <div className="h-28 rounded-xl bg-card/60 animate-pulse border border-border/40" />
              <div className="h-[180px] rounded-xl bg-card/60 animate-pulse border border-border/40" />
              <div className="h-[200px] rounded-xl bg-card/60 animate-pulse border border-border/40" />
              <span className="sr-only">Loading...</span>
            </div>
          }
        >
          {account ? (
            <div className="flex flex-col gap-4">
              <StatCards account={account} recurringTxns={transactions} nextPayday={nextPayday} friendBreakdown={friendBreakdown} safetyBuffer={account.safety_buffer ?? 0} />

              {transactions.length === 0 && paySchedules.length === 0 && (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="font-semibold mb-2">Set up your finances</p>
                    <div className="text-sm text-muted-foreground text-left space-y-1 max-w-xs mx-auto">
                      <p>&#9312; <Link to="/settings" className="underline">Add a pay schedule</Link> — tell us when you get paid</p>
                      <p>&#9313; <Link to="/transactions" className="underline">Create recurring bills</Link> — subscriptions, rent, etc.</p>
                      <p>&#9314; <span>Check what you can afford</span> — use "Can I Buy It?" above</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <PayWindowBar nextPayday={nextPayday} paySchedules={paySchedules} />

              <GoalsSnapshotWidget />

              <CheckWidget accountId={account.id} />

              <LedgerRecentWidget account={account} />

              <FriendLedgerWidget />

              <ObligationsList transactions={transactions} currency={account.currency} nextPayday={nextPayday} />

              <ProjectionWidget
                account={account}
                transactions={transactions}
                paySchedules={paySchedules}
                friendBreakdown={friendBreakdown}
                nextPayday={nextPayday}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => {
                    document.getElementById('pay-schedules')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                >
                  Based on your pay schedule <ArrowDown size={12} />
                </button>
              </div>

              <PayScheduleList schedules={paySchedules} currency={account.currency} />
            </div>
          ) : null}
        </Skeleton>
      )}

      <div className="h-8" />
    </div>
  )
}

const rootRoute = createRootRoute({ component: RootLayout })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
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

const publicRootRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'public',
  staticData: { layout: 'public' },
  component: PublicLayout,
})

const publicFriendRoute = createRoute({
  getParentRoute: () => publicRootRoute,
  path: '/public/friend/$token',
  component: FriendPublicPage,
})

const publicGroupRoute = createRoute({
  getParentRoute: () => publicRootRoute,
  path: '/public/group/$token',
  component: GroupPublicPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  accountsRoute,
  transactionsRoute,
  friendsRoute,
  settingsRoute,
  goalsRoute,
  publicRootRoute.addChildren([publicFriendRoute, publicGroupRoute]),
])

export const router = createRouter({ routeTree })
export { publicFriendRoute, publicGroupRoute }

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
