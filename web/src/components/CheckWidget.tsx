import { useState } from 'react'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { postCheck, type CheckResponse } from '@/lib/api'

type WidgetState = 'idle' | 'loading' | 'verdict'

const RISK_COLORS: Record<string, string> = {
  LOW: 'var(--color-risk-low)',
  MEDIUM: 'var(--color-risk-medium)',
  HIGH: 'var(--color-risk-high)',
  BLOCKED: 'var(--color-risk-blocked)',
  WAIT: 'var(--color-verdict-wait)',
}

export function CheckWidget() {
  const [state, setState] = useState<WidgetState>('idle')
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState<CheckResponse | null>(null)

  async function handleCheck() {
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) return

    setState('loading')
    try {
      const res = await postCheck(parsed)
      setResult(res)
      setState('verdict')
    } catch (err) {
      const error = err as Error & { code?: string }
      if (error.code === 'PAY_SCHEDULE_REQUIRED') {
        toast.error('Set up your pay schedule in Settings first.')
      } else {
        toast.error('Something went wrong. Try again.')
      }
      setState('idle')
    }
  }

  function handleReset() {
    setState('idle')
    setAmount('')
    setResult(null)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-5 flex flex-col gap-4">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Can I Buy It?
      </p>

      {state !== 'verdict' ? (
        <div className="flex gap-2 items-stretch">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground select-none text-sm">
              $
            </span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCheck()}
              disabled={state === 'loading'}
              className="pl-7 h-11 bg-muted/50 border-border/60 text-base focus-visible:ring-primary/50"
            />
          </div>
          <Button
            onClick={handleCheck}
            disabled={state === 'loading'}
            className="h-11 px-6 font-semibold tracking-wide cursor-pointer"
          >
            {state === 'loading' ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              'CHECK'
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(() => {
            const isWait = !result!.can_buy && result!.will_afford_after_payday
            return (
              <motion.div
                initial={{ scale: 0.90, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-lg p-5 flex flex-col gap-3 border"
                style={{
                  background: result!.can_buy
                    ? 'var(--color-verdict-yes-tint)'
                    : isWait
                    ? 'var(--color-verdict-wait-tint)'
                    : 'var(--color-verdict-no-tint)',
                  borderColor: result!.can_buy
                    ? 'oklch(0.72 0.19 142 / 0.35)'
                    : isWait
                    ? 'oklch(0.78 0.17 85 / 0.35)'
                    : 'oklch(0.65 0.22 25 / 0.35)',
                  boxShadow: result!.can_buy
                    ? '0 0 32px oklch(0.72 0.19 142 / 0.25)'
                    : isWait
                    ? '0 0 32px oklch(0.78 0.17 85 / 0.25)'
                    : '0 0 32px oklch(0.65 0.22 25 / 0.25)',
                }}
              >
                <p
                  className="text-4xl font-semibold tracking-tight leading-none"
                  style={{
                    color: result!.can_buy
                      ? 'var(--color-verdict-yes)'
                      : isWait
                      ? 'var(--color-verdict-wait)'
                      : 'var(--color-verdict-no)',
                  }}
                >
                  {result!.can_buy ? 'YES' : isWait ? 'WAIT' : 'NO'}
                </p>

                <div className="flex flex-col gap-1.5 text-sm text-foreground/80">
                  <p>
                    Purchasing power:{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(result!.purchasing_power)}
                    </span>
                  </p>
                  <p>
                    Buffer remaining:{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(result!.buffer_remaining)}
                    </span>
                  </p>
                  {isWait && result!.wait_until && (
                    <p className="text-sm text-foreground/80">
                      Not yet — you'll have enough after{' '}
                      <span className="font-medium">
                        {new Date(result!.wait_until).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </p>
                  )}
                </div>

                <span
                  className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded-md w-fit"
                  style={{
                    color: RISK_COLORS[result!.risk_level],
                    background: `${RISK_COLORS[result!.risk_level]}1a`,
                  }}
                >
                  {result!.risk_level} RISK
                </span>
              </motion.div>
            )
          })()}

          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full h-11 border-border/60 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Check another
          </Button>
        </div>
      )}
    </div>
  )
}
