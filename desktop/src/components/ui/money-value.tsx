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

  // auto: rely on color semantics only (no explicit + / - signal)
  return ''
}

function getToneClass(amount: number, tone: MoneyTone): string {
  if (tone === 'positive') {
    return 'text-pos'
  }

  if (tone === 'negative') {
    return 'text-neg'
  }

  if (tone === 'neutral') {
    return 'text-muted-foreground'
  }

  return amount >= 0 ? 'text-pos' : 'text-neg'
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
    <span className={cn('num', toneClass, className)}>
      {signPrefix}
      {formattedValue}
    </span>
  )
}
