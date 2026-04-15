import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, Outlet, useLocation } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { createContext, useState } from 'react'
import { router } from './router'
import { Sidebar } from '@/components/Sidebar'
import { MobileHeader } from '@/components/MobileHeader'
import { MobileDrawer } from '@/components/MobileDrawer'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})

export const AccountContext = createContext<{
  selectedAccountId: string | null
  setSelectedAccountId: (id: string | null) => void
}>({
  selectedAccountId: null,
  setSelectedAccountId: () => {},
})

function RootLayoutWithNav() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  return (
    <div className="flex h-dvh bg-background">
      <Sidebar />
      <MobileHeader onMenuClick={() => setMobileDrawerOpen(true)} />
      <MobileDrawer open={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} />
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  )
}

export function RootLayout() {
  const location = useLocation()
  const pathname = location.pathname || '/'

  if (pathname.startsWith('/public/friend') || pathname.startsWith('/public/group')) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    )
  }

  return <RootLayoutWithNav />
}

export default function App() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  return (
    <QueryClientProvider client={queryClient}>
      <AccountContext.Provider value={{ selectedAccountId, setSelectedAccountId }}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </AccountContext.Provider>
    </QueryClientProvider>
  )
}
