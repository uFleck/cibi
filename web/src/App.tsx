import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { createContext, useState } from 'react'
import { router } from './router'

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
