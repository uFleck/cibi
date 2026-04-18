import { Link, useLocation } from '@tanstack/react-router'
import { LayoutDashboard, Users, FileText, HandCoins, Settings } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accts', icon: Users },
  { to: '/transactions', label: 'Txns', icon: FileText },
  { to: '/friends', label: 'Friends', icon: HandCoins },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function MobileBottomNav() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.6rem)] left-1/2 z-40 -translate-x-1/2 rounded-full border border-border/60 bg-background/95 px-2 py-2 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-1">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className={`flex h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[11px] transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
