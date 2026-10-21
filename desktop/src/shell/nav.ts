import { ArrowLeftRight, HandCoins, Tags, LayoutDashboard, ListChecks, Settings, Target, Wallet, type LucideIcon } from 'lucide-react'

export type NavTo = '/' | '/widgets' | '/transactions' | '/goals' | '/friends' | '/accounts' | '/categories' | '/settings'

export interface NavItem {
  to: NavTo
  label: string
  icon: LucideIcon
  chord: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'A pagar', icon: ListChecks, chord: 'd' },
  { to: '/widgets', label: 'Painel', icon: LayoutDashboard, chord: 'w' },
  { to: '/transactions', label: 'Transações', icon: ArrowLeftRight, chord: 't' },
  { to: '/goals', label: 'Metas', icon: Target, chord: 'g' },
  { to: '/friends', label: 'Amigos', icon: HandCoins, chord: 'f' },
  { to: '/accounts', label: 'Contas', icon: Wallet, chord: 'a' },
  { to: '/categories', label: 'Categorias', icon: Tags, chord: 'c' },
  { to: '/settings', label: 'Configurações', icon: Settings, chord: 's' },
]

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(item => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)))
}
