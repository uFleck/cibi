import { Link, useLocation } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
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
  const reduceMotion = useReducedMotion()

  return (
    <motion.nav
      initial={reduceMotion ? undefined : { y: 18, opacity: 0 }}
      animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
      transition={reduceMotion ? undefined : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.6rem)] left-1/2 z-40 -translate-x-1/2 rounded-full border border-border/60 bg-background/95 px-2 py-2 shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-center gap-1">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className={`relative flex h-11 min-w-14 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full px-2 text-[11px] transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-muted-foreground hover:bg-white/8 hover:text-foreground'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-nav-active-pill"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 560, damping: 42, mass: 0.85 }
                  }
                  className="absolute inset-0 rounded-full bg-accent"
                />
              )}

              <motion.span
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        scale: isActive ? 1.06 : 1,
                        y: isActive ? -1 : 0,
                      }
                }
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="relative z-10"
              >
                <Icon size={18} />
              </motion.span>

              <motion.span
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        opacity: isActive ? 1 : 0.84,
                        y: isActive ? 0 : 1,
                      }
                }
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative z-10"
              >
                {label}
              </motion.span>
            </Link>
          )
        })}
      </div>
    </motion.nav>
  )
}
