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
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { focusWhenReady, useShellAction } from '@/shell/shellActions'

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
    <article className="rounded-xl border border-border/60 bg-card p-3 shadow-sm" aria-label={`Impacto da compra em ${impact.goal_name}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex flex-col gap-1">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">{impact.goal_name}</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Impacto na capacidade de aporte</p>
          </div>
          <Badge variant="outline" className={`uppercase tracking-wide ${SEVERITY_BADGE_CLASS[impact.severity]}`}>
            {impact.severity}
          </Badge>
        </div>

        <div className="rounded-lg bg-muted/40 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Aporte mínimo no período</p>
          <p className="text-xs font-semibold tabular-nums text-foreground">
            <MoneyValue amount={impact.min_contribution_per_window} tone="neutral" showSign="never" className="text-foreground" />
          </p>
        </div>

        <p className="text-xs text-foreground">
          Esta verificação <span className="font-semibold">não</span> altera o progresso da meta.
          Ela só indica que esta compra deixa pouco para o aporte mínimo do período.
        </p>
      </div>
    </article>
  )
}

type CheckWidgetProps = {
  accountId: string
}

export function CheckWidget({ accountId }: CheckWidgetProps) {
  const reduceMotion = useReducedMotion()
  useShellAction('focus-check', () => focusWhenReady('#check-amount'))
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
        setErrorMessage('Configure o recebimento em Contas primeiro, depois tente esta verificação de novo.')
        toast.error('Configure o recebimento em Contas primeiro.')
      } else {
        setErrorMessage('Algo deu errado. Tente de novo quando a conexão estiver disponível.')
        toast.error('Algo deu errado. Tente de novo.')
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
    <div aria-label="Verificador Posso comprar?" className="flex flex-col gap-4">

        {state !== 'verdict' ? (
          <div className="flex flex-col gap-3" aria-label={state === 'loading' ? 'Verificando impacto da compra' : 'Verificar impacto da compra'}>
            <Label htmlFor="check-amount">Valor da compra</Label>
            <div className="flex flex-col gap-2 @md:flex-row @md:items-stretch">
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
                      className="h-11 w-full px-6 font-semibold tracking-wide cursor-pointer @md:w-auto"
                      aria-label={state === 'loading' ? 'Verificando impacto da compra' : 'Verificar impacto da compra'}
                    >
                      {state === 'loading' ? (
                        <>
                          <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                          <span>Verificando...</span>
                        </>
                      ) : (
                        'VERIFICAR'
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Veja se você pode fazer esta compra</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {state === 'loading' ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                Verificando esta compra com seu fluxo de caixa, margem e metas ativas...
              </p>
            ) : null}
            {errorMessage ? (
              <Card className="border-destructive/30 bg-destructive/5 py-0 shadow-none" role="alert" aria-label="Erro na verificação da compra">
                <CardContent id="check-error" className="px-3 py-3">
                  <p className="text-sm font-medium text-destructive">Não deu para verificar o impacto da compra.</p>
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
                  initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-xl p-4 flex flex-col gap-4 border shadow-sm"
                  style={{
                    background: result.can_buy
                      ? 'var(--color-verdict-yes-tint)'
                      : isWait
                        ? 'var(--color-verdict-wait-tint)'
                        : 'var(--color-verdict-no-tint)',
                    borderColor: result.can_buy
                      ? 'color-mix(in oklab, var(--color-verdict-yes) 35%, transparent)'
                      : isWait
                        ? 'color-mix(in oklab, var(--color-verdict-wait) 35%, transparent)'
                        : 'color-mix(in oklab, var(--color-verdict-no) 35%, transparent)',
                    boxShadow: result.can_buy
                      ? '0 0 32px color-mix(in oklab, var(--color-verdict-yes) 20%, transparent)'
                      : isWait
                        ? '0 0 32px color-mix(in oklab, var(--color-verdict-wait) 20%, transparent)'
                        : '0 0 32px color-mix(in oklab, var(--color-verdict-no) 20%, transparent)',
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
                        {result.can_buy ? 'SIM' : isWait ? 'AGUARDE' : 'NÃO'}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Veredito</p>
                    </div>

                    <span
                      className="text-xs font-semibold uppercase tracking-widest px-2 py-1 rounded-full w-fit border"
                      style={{
                        color: RISK_COLORS[result.risk_level],
                        background: `color-mix(in oklab, ${RISK_COLORS[result.risk_level]} 10%, transparent)`,
                        borderColor: `color-mix(in oklab, ${RISK_COLORS[result.risk_level]} 25%, transparent)`,
                      }}
                    >
                      {result.risk_level} RISK
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-background/60 px-2.5 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Poder de compra</p>
                      <p className="text-xs font-semibold tabular-nums">
                        <MoneyValue amount={result.purchasing_power} tone="auto" showSign="always" />
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/60 px-2.5 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Margem restante</p>
                      <p className="text-xs font-semibold tabular-nums">
                        <MoneyValue amount={result.buffer_remaining} tone="auto" showSign="always" />
                      </p>
                    </div>
                  </div>

                  {isWait && result.wait_until ? (
                    <Card className="border-[var(--color-verdict-wait)]/30 bg-background/60 py-0 shadow-none">
                      <CardContent className="px-3 py-3">
                        <p className="text-sm text-foreground/80">
                          Ainda não — você terá o suficiente depois de{' '}
                          <span className="font-medium">{formatDate(result.wait_until)}</span>
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}

                  {result.goal_impacts.length > 0 ? (
                    <div className="flex flex-col gap-2" aria-label="Prévia do impacto nas metas">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do impacto nas metas</p>
                        <Badge variant="secondary">{result.goal_impacts.length} afetadas</Badge>
                      </div>
                      {result.goal_impacts.map(impact => <GoalImpactCard key={impact.goal_id} impact={impact} />)}
                    </div>
                  ) : (
                    <Card className="border-border/60 bg-background/60 py-0 shadow-none" aria-label="Prévia do impacto nas metas">
                      <CardContent className="px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do impacto nas metas</p>
                        <p className="mt-1 text-sm text-foreground">Nenhuma meta ativa afetada.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          O veredito é baseado nas regras de fluxo de caixa e margem; nenhum progresso de meta muda nesta verificação.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {result.goals_covered_this_window.length > 0 ? (
                    <Card className="border-[var(--color-risk-low)]/30 bg-[var(--color-risk-low)]/5 py-0 shadow-none" aria-label="Metas já cobertas neste período">
                      <CardContent className="px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Já coberto neste período</p>
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
              Verificar outra
            </Button>
          </div>
        ) : null}
    </div>
  )
}
