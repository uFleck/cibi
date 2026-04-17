import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

export type MoneyTone = 'auto' | 'positive' | 'negative' | 'neutral'
export type MoneySign = 'auto' | 'always' | 'never'

export interface MoneyValueProps {
  amount: number
  currency?: string
  tone?: 'auto' | 'positive' | 'negative' | 'neutral'
  showSign?: 'auto' | 'always' | 'never'
  className?: string
}

function getSignPrefix(amount: number, showSign: MoneySign): string {
  if (showSign === 'never') {
    return ''
  }

  if (showSign === 'always') {
    return amount < 0 ? '-' : '+'
  }

  return amount < 0 ? '-' : ''
}

function getToneClass(amount: number, tone: MoneyTone): string {
  if (tone === 'positive') {
    return 'text-green-600'
  }

  if (tone === 'negative') {
    return 'text-red-500'
  }

  if (tone === 'neutral') {
    return 'text-muted-foreground'
  }

  return amount >= 0 ? 'text-green-600' : 'text-red-500'
}

export function MoneyValue({
  amount,
  currency = 'BRL',
  tone = 'auto',
  showSign = 'auto',
  className,
}: MoneyValueProps) {
  const signPrefix = getSignPrefix(amount, showSign)
  const formattedValue = formatMoney(Math.abs(amount), currency)
  const toneClass = getToneClass(amount, tone)

  return (
    <span className={cn('tabular-nums', toneClass, className)}>
      {signPrefix}
      {formattedValue}
    </span>
  )
}
