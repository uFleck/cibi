import { Link, useLocation } from '@tanstack/react-router'
import { LayoutDashboard, FileText, HandCoins, Settings } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Txns', icon: FileText },
  { to: '/friends', label: 'Friends', icon: HandCoins },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function MobileBottomNav() {
  const location = useLocation()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${
                isActive ? 'text-primary' : 'text-muted-foreground'
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
