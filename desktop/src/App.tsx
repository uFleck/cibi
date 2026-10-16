/* eslint-disable react-hooks/set-state-in-effect */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { RouterProvider, Outlet } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { Toaster } from '@/components/ui/sonner'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { router } from './router'
import { fetchAccounts } from '@/lib/api'
import { AppShell } from '@/shell/AppShell'
import { LayoutProvider } from '@/widgets/LayoutProvider'
import { AccountContext, ThemeContext, type ThemeMode } from '@/shell/contexts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})

export { AccountContext, ThemeContext }
export type { ThemeMode }

export function RootLayout() {
  return (
    <LayoutProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </LayoutProvider>
  )
}

const SELECTED_ACCOUNT_STORAGE_KEY = 'cibi.selectedAccountId'
const THEME_STORAGE_KEY = 'cibi.theme'

function getInitialSelectedAccountId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SELECTED_ACCOUNT_STORAGE_KEY)
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

function AppProviders() {
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(getInitialSelectedAccountId)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)

  const setSelectedAccountId = useCallback((id: string | null) => {
    setSelectedAccountIdState(id)

    if (typeof window === 'undefined') return
    if (id) {
      window.localStorage.setItem(SELECTED_ACCOUNT_STORAGE_KEY, id)
    } else {
      window.localStorage.removeItem(SELECTED_ACCOUNT_STORAGE_KEY)
    }
  }, [])

  const {
    data: accounts = [],
    isLoading: accountsLoading,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const root = window.document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  useEffect(() => {
    if (accountsLoading) return

    if (accounts.length === 0) {
      if (selectedAccountId !== null) {
        setSelectedAccountId(null)
      }
      return
    }

    const selectedAccountStillExists = !!selectedAccountId && accounts.some(account => account.id === selectedAccountId)
    if (selectedAccountStillExists) return

    const fallbackAccountId = accounts[0]?.id ?? null
    if (fallbackAccountId && fallbackAccountId !== selectedAccountId) {
      setSelectedAccountId(fallbackAccountId)
    }
  }, [accounts, accountsLoading, selectedAccountId, setSelectedAccountId])

  const accountReady = useMemo(() => {
    if (accountsLoading) return false
    if (accounts.length === 0) return true
    return !!selectedAccountId
  }, [accounts.length, accountsLoading, selectedAccountId])

  if (!accountReady) {
    return <div className="min-h-dvh bg-background" />
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <AccountContext.Provider value={{ selectedAccountId, setSelectedAccountId }}>
        <RouterProvider router={router} />
        <Toaster theme={theme} />
      </AccountContext.Provider>
    </ThemeContext.Provider>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AppProviders />
      </QueryClientProvider>
    </MotionConfig>
  )
}
