import { useState } from 'react'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/format'
import { postCheck, type CheckResponse } from '@/lib/api'

type WidgetState = 'idle' | 'loading' | 'verdict'

const RISK_COLORS: Record<CheckResponse['risk_level'], string> = {
  LOW: 'var(--color-risk-low)',
  MEDIUM: 'var(--color-risk-medium)',
  HIGH: 'var(--color-risk-high)',
  BLOCKED: 'var(--color-risk-blocked)',
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
    } catch {
      setState('idle')
      toast.error('Something went wrong running the check. Try again.')
    }
  }

  function handleReset() {
    setState('idle')
    setAmount('')
    setResult(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Can I Buy It?</CardTitle>
      </CardHeader>
      <CardContent>
        {state !== 'verdict' ? (
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground select-none">
                $
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={state === 'loading'}
                className="pl-7"
              />
            </div>
            <Button
              onClick={handleCheck}
              disabled={state === 'loading'}
              className="min-h-[44px]"
            >
              {state === 'loading' ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                'CHECK'
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <motion.div
              initial={{
                scale: 0.8,
                opacity: 0,
                backgroundColor: result!.can_buy
                  ? 'oklch(0.65 0.17 142)'
                  : 'oklch(0.60 0.22 25)',
              }}
              animate={{
                scale: 1.0,
                opacity: 1,
                backgroundColor: result!.can_buy
                  ? 'oklch(0.97 0.04 142)'
                  : 'oklch(0.97 0.04 25)',
              }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="rounded-xl p-6 flex flex-col gap-3"
            >
              <p
                className="text-[28px] font-semibold leading-tight"
                style={{
                  color: result!.can_buy
                    ? 'var(--color-verdict-yes)'
                    : 'var(--color-verdict-no)',
                }}
              >
                {result!.can_buy ? 'YES' : 'NO'}
              </p>
              <p className="text-base">
                Purchasing power:{' '}
                <span className="font-medium">
                  {formatMoney(result!.purchasing_power)}
                </span>
              </p>
              <p className="text-base">
                Buffer remaining:{' '}
                <span className="font-medium">
                  {formatMoney(result!.buffer_remaining)}
                </span>
              </p>
              <Badge
                style={{
                  backgroundColor: RISK_COLORS[result!.risk_level],
                  color: '#fff',
                  width: 'fit-content',
                }}
              >
                {result!.risk_level}
              </Badge>
            </motion.div>

            <Button
              variant="outline"
              onClick={handleReset}
              className="w-full min-h-[44px]"
            >
              Check another
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
