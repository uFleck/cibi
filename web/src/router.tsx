import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useEffect, useContext } from 'react'
import { Cog } from 'lucide-react'
import { StatCards } from '@/components/StatCards'
import { CheckWidget } from '@/components/CheckWidget'
import { ObligationsList } from '@/components/ObligationsList'
import { AccountSelector } from '@/components/AccountSelector'
import { Settings } from '@/pages/settings'
import { AccountsPage } from '@/pages/accounts'
import { TransactionsPage } from '@/pages/transactions'
import { fetchDefaultAccount, fetchAccounts, fetchTransactions } from '@/lib/api'
import { AccountContext } from '@/App'

function Dashboard() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext)

  const {
    data: allAccounts = [],
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

  useEffect(() => {
    if (accountError || txnsError) {
      toast.error('Could not load financial data. Retrying in 30 seconds.')
    }
  }, [accountError, txnsError])

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/50 sticky top-0 z-10 backdrop-blur-sm bg-background/80">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center gap-4">
          <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
            CIBI
          </span>
          <div className="flex-1 flex justify-center">
            <AccountSelector selectedAccountId={selectedAccountId} onSelectAccount={setSelectedAccountId} />
          </div>
          <a
            href="/settings"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
            aria-label="Settings"
          >
            <Cog size={14} />
            <span>Settings</span>
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        {account ? (
          <StatCards account={account} recurringTxns={transactions} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[88px] rounded-xl bg-card/60 animate-pulse border border-border/40" />
            ))}
          </div>
        )}

        <CheckWidget />

        <ObligationsList transactions={transactions} />

        <div className="h-8" />
      </main>
    </div>
  )
}

const rootRoute = createRootRoute()
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
