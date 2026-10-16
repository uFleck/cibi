import { ArrowLeftRight, HandCoins, LayoutDashboard, Settings, Target, Wallet, type LucideIcon } from 'lucide-react'

export type NavTo = '/' | '/transactions' | '/goals' | '/friends' | '/accounts' | '/settings'

export interface NavItem {
  to: NavTo
  label: string
  icon: LucideIcon
  chord: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, chord: 'd' },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, chord: 't' },
  { to: '/goals', label: 'Goals', icon: Target, chord: 'g' },
  { to: '/friends', label: 'Friends', icon: HandCoins, chord: 'f' },
  { to: '/accounts', label: 'Accounts', icon: Wallet, chord: 'a' },
  { to: '/settings', label: 'Settings', icon: Settings, chord: 's' },
]

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(item => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)))
}
