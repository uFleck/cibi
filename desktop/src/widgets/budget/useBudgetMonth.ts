import { useEffect, useState } from 'react'
import { monthKey } from '@/widgets/categories/spend'

const REFRESH_MS = 60_000

/**
 * The current local month, YYYY-MM. Recomputed every minute and when the window gets focus or
 * becomes visible again, so a long-open app rolls over to the new month. Every budget query keys on
 * this value, so the widget and the editor always agree.
 */
export function useBudgetMonth(): string {
  const [month, setMonth] = useState(() => monthKey(new Date()))

  useEffect(() => {
    const refresh = () => {
      const next = monthKey(new Date())
      setMonth(current => (current === next ? current : next))
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return month
}
