import { CalendarRange, HandCoins, ReceiptText, Settings, type LucideIcon } from 'lucide-react'

export type NavTo = '/' | '/extrato' | '/amigos' | '/ajustes'

export interface NavItem {
  to: NavTo
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Plano', icon: CalendarRange },
  { to: '/extrato', label: 'Extrato', icon: ReceiptText },
  { to: '/amigos', label: 'Amigos', icon: HandCoins },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(item => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)))
}
