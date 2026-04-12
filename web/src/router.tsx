import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { StatCards } from '@/components/StatCards'
import { CheckWidget } from '@/components/CheckWidget'
import { ObligationsList } from '@/components/ObligationsList'
import { fetchDefaultAccount, fetchTransactions } from '@/lib/api'

function Dashboard() {
  const {
    data: account,
    isError: accountError,
  } = useQuery({
    queryKey: ['account', 'default'],
    queryFn: fetchDefaultAccount,
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <span className="text-sm font-normal text-muted-foreground">CIBI</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 flex flex-col gap-8">
        {account ? (
          <StatCards
            account={account}
            recurringTxns={transactions}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        <CheckWidget />

        <ObligationsList transactions={transactions} />
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
const routeTree = rootRoute.addChildren([indexRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
