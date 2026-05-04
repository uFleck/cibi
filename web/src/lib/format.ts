import { APP_LOCALE } from '@/lib/locale'

export function formatMoney(amount: number, currency = 'BRL'): string {
  const isNegative = amount < 0
  const absAmount = Math.abs(amount)
  const formatted = new Intl.NumberFormat(APP_LOCALE, {
    style: 'currency',
    currency,
  }).format(absAmount)
  return isNegative ? `-${formatted}` : formatted
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(APP_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
