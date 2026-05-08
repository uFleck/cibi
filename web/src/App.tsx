/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { RouterProvider, Outlet, useLocation } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { router } from './router'
import { MobileHeader } from '@/components/MobileHeader'
import { MobileBottomNav } from '@/components/MobileBottomNav'
import { fetchAccounts, fetchProfile } from '@/lib/api'

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

export type ThemeMode = 'light' | 'dark'

export const ThemeContext = createContext<{
  theme: ThemeMode
  toggleTheme: () => void
}>({
  theme: 'dark',
  toggleTheme: () => {},
})

function RootLayoutWithNav() {
  return (
    <div className="flex h-dvh bg-background">
      <MobileHeader />
      <main className="flex-1 overflow-auto pt-[calc(4.25rem+env(safe-area-inset-top))] pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <MobileBottomNav />
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

const SELECTED_ACCOUNT_STORAGE_KEY = 'cibi.selectedAccountId'
const THEME_STORAGE_KEY = 'cibi.theme'

function getInitialSelectedAccountId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SELECTED_ACCOUNT_STORAGE_KEY)
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'

  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function AppShell() {
  const isPublicView = typeof window !== 'undefined' && window.location.pathname.startsWith('/public/')

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
    enabled: !isPublicView,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile', selectedAccountId],
    queryFn: () => fetchProfile(selectedAccountId as string),
    enabled: !isPublicView && !!selectedAccountId,
  })

  useEffect(() => {
    const theme = profile?.theme ?? 'neutral-command'
    document.documentElement.setAttribute('data-theme', theme)
  }, [profile?.theme])

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
    if (isPublicView) return
    if (accountsLoading) return

    if (accounts.length === 0) {
      if (selectedAccountId !== null) {
        setSelectedAccountId(null)
      }
      return
    }

    const selectedAccountStillExists = !!selectedAccountId && accounts.some(account => account.id === selectedAccountId)
    if (selectedAccountStillExists) return

    const fallbackAccountId = accounts.find(account => account.is_default)?.id ?? accounts[0]?.id ?? null
    if (fallbackAccountId && fallbackAccountId !== selectedAccountId) {
      setSelectedAccountId(fallbackAccountId)
    }
  }, [accounts, accountsLoading, selectedAccountId, setSelectedAccountId, isPublicView])

  const accountReady = useMemo(() => {
    if (isPublicView) return true
    if (accountsLoading) return false
    if (accounts.length === 0) return true
    return !!selectedAccountId
  }, [isPublicView, accounts.length, accountsLoading, selectedAccountId])

  if (!accountReady) {
    return <div className="min-h-dvh bg-background" />
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AccountContext.Provider value={{ selectedAccountId, setSelectedAccountId }}>
        <RouterProvider router={router} />
        <Toaster />
      </AccountContext.Provider>
    </ThemeContext.Provider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}
