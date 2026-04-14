import { createRootRoute, createRoute, createRouter, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useEffect, useContext } from 'react'
import { Plus } from 'lucide-react'
import { Skeleton } from 'boneyard-js/react'
import { StatCards } from '@/components/StatCards'
import { CheckWidget } from '@/components/CheckWidget'
import { ObligationsList } from '@/components/ObligationsList'
import { PayScheduleList } from '@/components/PayScheduleList'
import { Settings } from '@/pages/settings'
import { AccountsPage } from '@/pages/accounts'
import { TransactionsPage } from '@/pages/transactions'
import { fetchDefaultAccount, fetchAccounts, fetchTransactions, listPaySchedules } from '@/lib/api'
import { AccountContext, RootLayout } from '@/App'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function Dashboard() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

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

  // Sync default account into context on first load
  useEffect(() => {
    if (!selectedAccountId && defaultAccount?.id) {
      setSelectedAccountId(defaultAccount.id)
    }
  }, [defaultAccount?.id, selectedAccountId, setSelectedAccountId])

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
          name="stat-cards"
          loading={!account}
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="status" aria-label="Loading dashboard">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-[88px] rounded-xl bg-card/60 animate-pulse border border-border/40" />
              ))}
              <span className="sr-only">Loading...</span>
            </div>
          }
        >
          {account ? <StatCards account={account} recurringTxns={transactions} nextPayday={nextPayday} /> : null}
        </Skeleton>
      )}

      <CheckWidget />

      <ObligationsList transactions={transactions} currency={account?.currency} nextPayday={nextPayday} />

      <PayScheduleList schedules={paySchedules} currency={account?.currency} />

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
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings,
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
const routeTree = rootRoute.addChildren([indexRoute, settingsRoute, accountsRoute, transactionsRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
