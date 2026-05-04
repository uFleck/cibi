import type * as React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseDecimalInput } from '@/lib/locale'

type ValueInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'inputMode' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  onParsedValueChange?: (value: number | null) => void
  allowNegative?: boolean
  showSignToggle?: boolean
  negativeLabel?: string
  positiveLabel?: string
  wrapperClassName?: string
  inputClassName?: string
}

function parseAmount(raw: string): number | null {
  return parseDecimalInput(raw)
}

export function ValueInput({
  value,
  onValueChange,
  onParsedValueChange,
  allowNegative = true,
  showSignToggle = false,
  negativeLabel = 'Expense (-)',
  positiveLabel = 'Income (+)',
  wrapperClassName,
  inputClassName,
  className,
  ...props
}: ValueInputProps) {
  const push = (next: string) => {
    const sanitized = allowNegative ? next : next.replace(/-/g, '')
    onValueChange(sanitized)
    onParsedValueChange?.(parseAmount(sanitized))
  }

  const parsed = parseAmount(value)
  const isNegative = value.trim().startsWith('-') || (parsed != null && parsed < 0)

  return (
    <div className={cn('flex flex-col gap-2', wrapperClassName)}>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => push(e.target.value)}
        className={cn(className, inputClassName)}
      />

      {showSignToggle && (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={isNegative ? 'secondary' : 'outline'}
            onClick={() => {
              if (parsed == null) {
                push('-')
                return
              }
              push((-Math.abs(parsed)).toString())
            }}
          >
            {negativeLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!isNegative ? 'secondary' : 'outline'}
            onClick={() => {
              if (parsed == null) {
                push('')
                return
              }
              push(Math.abs(parsed).toString())
            }}
          >
            {positiveLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
