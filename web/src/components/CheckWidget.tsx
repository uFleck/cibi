import { useState } from 'react'
import { motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MoneyValue } from '@/components/ui/money-value'
import { ValueInput } from '@/components/ui/value-input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate } from '@/lib/format'
import { parseDecimalInput } from '@/lib/locale'
import { postCheck, type CheckGoalImpactResponse, type CheckResponse } from '@/lib/api'

export const LAST_CHECK_RESULT_KEY = 'cibi:last-check-result'

type WidgetState = 'idle' | 'loading' | 'verdict'

const RISK_COLORS: Record<string, string> = {
  LOW: 'var(--color-risk-low)',
  MEDIUM: 'var(--color-risk-medium)',
  HIGH: 'var(--color-risk-high)',
  BLOCKED: 'var(--color-risk-blocked)',
  WAIT: 'var(--color-verdict-wait)',
}

const SEVERITY_BADGE_CLASS: Record<CheckGoalImpactResponse['severity'], string> = {
  low: 'border-[var(--color-risk-low)]/30 bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]',
  medium: 'border-[var(--color-risk-medium)]/30 bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]',
  high: 'border-[var(--color-risk-high)]/30 bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]',
}

interface GoalImpactCardProps {
  impact: CheckGoalImpactResponse
}

function GoalImpactCard({ impact }: GoalImpactCardProps) {
  return (
    <article className="rounded-xl border border-border/60 bg-card p-3 shadow-sm" aria-label={`${impact.goal_name} purchase impact`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex flex-col gap-1">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">{impact.goal_name}</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Contribution capacity impact</p>
          </div>
          <Badge variant="outline" className={`uppercase tracking-wide ${SEVERITY_BADGE_CLASS[impact.severity]}`}>
            {impact.severity}
          </Badge>
        </div>

        <div className="rounded-lg bg-muted/40 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Min contribution / payment window</p>
          <p className="text-xs font-semibold tabular-nums text-foreground">
            <MoneyValue amount={impact.min_contribution_per_window} tone="neutral" showSign="never" className="text-foreground" />
          </p>
        </div>

        <p className="text-xs text-foreground">
          This check does <span className="font-semibold">not</span> move goal progress.
          It only flags that this purchase leaves too little for your minimum window contribution.
        </p>
      </div>
    </article>
  )
}

type CheckWidgetProps = {
  accountId?: string
}

export function CheckWidget({ accountId }: CheckWidgetProps) {
  const [state, setState] = useState<WidgetState>('idle')
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState<CheckResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleCheck() {
    const parsed = parseDecimalInput(amount)
    if (parsed == null || parsed <= 0) return

    setErrorMessage(null)
    setState('loading')
    try {
      const res = await postCheck(parsed, accountId)
      setResult(res)
      try {
        sessionStorage.setItem(LAST_CHECK_RESULT_KEY, JSON.stringify(res))
      } catch {
        // ignore storage restrictions
      }
      setState('verdict')
    } catch (err) {
      const error = err as Error & { code?: string }
      if (error.code === 'PAY_SCHEDULE_REQUIRED') {
        setErrorMessage('Set up your pay schedule in Accounts first, then try this check again.')
        toast.error('Set up your pay schedule in Accounts first.')
      } else {
        setErrorMessage('Something went wrong. Try again when the connection is ready.')
        toast.error('Something went wrong. Try again.')
      }
      setState('idle')
    }
  }

  function handleReset() {
    setState('idle')
    setAmount('')
    setResult(null)
    setErrorMessage(null)
  }

  return (
    <Card className="border-border/60 py-0 shadow-sm" aria-label="Can I Buy It checker">
      <CardContent className="px-5 py-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Can I Buy It?
          </p>
          <p className="text-sm font-semibold tracking-tight text-foreground">Latest purchase impact</p>
        </div>

        {state !== 'verdict' ? (
          <div className="flex flex-col gap-3" aria-label={state === 'loading' ? 'Checking purchase impact' : 'Check purchase impact'}>
            <Label htmlFor="check-amount">Purchase amount</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground select-none text-sm" aria-hidden="true">
                  $
                </span>
                <ValueInput
                  id="check-amount"
                  placeholder="0.00"
                  value={amount}
                  onValueChange={setAmount}
                  onKeyDown={e => e.key === 'Enter' && handleCheck()}
                  disabled={state === 'loading'}
                  aria-describedby={errorMessage ? 'check-error' : undefined}
                  aria-invalid={!!errorMessage}
                  inputClassName="pl-7 h-11 bg-muted/50 border-border/60 text-base focus-visible:ring-primary/50"
                  allowNegative={false}
                />
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleCheck}
                      disabled={state === 'loading'}
                      className="h-11 w-full px-6 font-semibold tracking-wide cursor-pointer sm:w-auto"
                      aria-label={state === 'loading' ? 'Checking purchase impact' : 'Check purchase impact'}
                    >
                      {state === 'loading' ? (
                        <>
                          <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        'CHECK'
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Check if you can afford this purchase</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {state === 'loading' ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                Checking this purchase against your cash flow, buffer, and active goals...
              </p>
            ) : null}
            {errorMessage ? (
              <Card className="border-destructive/30 bg-destructive/5 py-0 shadow-none" role="alert" aria-label="Purchase check error">
                <CardContent id="check-error" className="px-3 py-3">
                  <p className="text-sm font-medium text-destructive">Could not check purchase impact.</p>
                  <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : result ? (
          <div className="flex flex-col gap-3">
            {(() => {
              const isWait = !result.can_buy && result.will_afford_after_payday
              return (
                <motion.div
                  initial={{ scale: 0.90, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-xl p-4 flex flex-col gap-4 border shadow-sm"
                  style={{
                    background: result.can_buy
                      ? 'var(--color-verdict-yes-tint)'
                      : isWait
                        ? 'var(--color-verdict-wait-tint)'
                        : 'var(--color-verdict-no-tint)',
                    borderColor: result.can_buy
                      ? 'oklch(0.72 0.19 142 / 0.35)'
                      : isWait
                        ? 'oklch(0.78 0.17 85 / 0.35)'
                        : 'oklch(0.65 0.22 25 / 0.35)',
                    boxShadow: result.can_buy
                      ? '0 0 32px oklch(0.72 0.19 142 / 0.20)'
                      : isWait
                        ? '0 0 32px oklch(0.78 0.17 85 / 0.20)'
                        : '0 0 32px oklch(0.65 0.22 25 / 0.20)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <p
                        className="text-4xl font-semibold tracking-tight leading-none"
                        style={{
                          color: result.can_buy
                            ? 'var(--color-verdict-yes)'
                            : isWait
                              ? 'var(--color-verdict-wait)'
                              : 'var(--color-verdict-no)',
                        }}
                      >
                        {result.can_buy ? 'YES' : isWait ? 'WAIT' : 'NO'}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Verdict</p>
                    </div>

                    <span
                      className="text-xs font-semibold uppercase tracking-widest px-2 py-1 rounded-full w-fit border"
                      style={{
                        color: RISK_COLORS[result.risk_level],
                        background: `${RISK_COLORS[result.risk_level]}1a`,
                        borderColor: `${RISK_COLORS[result.risk_level]}40`,
                      }}
                    >
                      {result.risk_level} RISK
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-background/60 px-2.5 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Purchasing power</p>
                      <p className="text-xs font-semibold tabular-nums">
                        <MoneyValue amount={result.purchasing_power} tone="auto" showSign="always" />
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/60 px-2.5 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Buffer remaining</p>
                      <p className="text-xs font-semibold tabular-nums">
                        <MoneyValue amount={result.buffer_remaining} tone="auto" showSign="always" />
                      </p>
                    </div>
                  </div>

                  {isWait && result.wait_until ? (
                    <Card className="border-[var(--color-verdict-wait)]/30 bg-background/60 py-0 shadow-none">
                      <CardContent className="px-3 py-3">
                        <p className="text-sm text-foreground/80">
                          Not yet — you'll have enough after{' '}
                          <span className="font-medium">{formatDate(result.wait_until)}</span>
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}

                  {result.goal_impacts.length > 0 ? (
                    <div className="flex flex-col gap-2" aria-label="Goal impact preview">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goal impact preview</p>
                        <Badge variant="secondary">{result.goal_impacts.length} affected</Badge>
                      </div>
                      {result.goal_impacts.map(impact => <GoalImpactCard key={impact.goal_id} impact={impact} />)}
                    </div>
                  ) : (
                    <Card className="border-border/60 bg-background/60 py-0 shadow-none" aria-label="Goal impact preview">
                      <CardContent className="px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goal impact preview</p>
                        <p className="mt-1 text-sm text-foreground">No active goals affected.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Your verdict is based on cash flow and buffer rules; no goal progress would move for this check.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {result.goals_covered_this_window.length > 0 ? (
                    <Card className="border-[var(--color-risk-low)]/30 bg-[var(--color-risk-low)]/5 py-0 shadow-none" aria-label="Goals already covered this window">
                      <CardContent className="px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Already covered this window</p>
                          <Badge variant="outline" className="uppercase tracking-wide">{result.goals_covered_this_window.length}</Badge>
                        </div>
                        <ul className="mt-2 space-y-1.5">
                          {result.goals_covered_this_window.map(goal => (
                            <li key={goal.goal_id} className="text-xs flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground truncate">{goal.goal_name}</span>
                              <span className="tabular-nums text-muted-foreground">
                                <MoneyValue amount={goal.contributed_this_window} tone="neutral" showSign="never" /> / <MoneyValue amount={goal.min_contribution_per_window} tone="neutral" showSign="never" />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ) : null}
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
        ) : null}
      </CardContent>
    </Card>
  )
}
