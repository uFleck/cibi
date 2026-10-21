import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, ShieldCheck, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ValueInput } from '@/components/ui/value-input'
import { MoneyValue } from '@/components/ui/money-value'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { formatMoney } from '@/lib/format'
import { effectiveAmount, updateAccount } from '@/lib/api'
import { countInCurrentPayWindow } from '@/lib/occurrences'
import { asNeededReserved, isScheduledBill } from '@/lib/bills'
import type {
  AccountResponse,
  TransactionResponse,
  FriendDebtBreakdownItem,
} from '@/lib/api'

interface StatCardsProps {
  account: AccountResponse
  recurringTxns: TransactionResponse[]
  nextPayday: string | null
  friendBreakdown?: FriendDebtBreakdownItem[]
  safetyBuffer?: number
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  children?: React.ReactNode
}

function AdjustBalanceForm({ account }: { account: AccountResponse }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(String(account.current_balance))
  const [parsed, setParsed] = useState<number | null>(account.current_balance)

  const adjust = useMutation({
    mutationFn: (balance: number) => updateAccount(account.id, { current_balance: balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['ledger'] })
      toast.success('Saldo ajustado')
    },
    onError: (error: Error) => toast.error(error.message || 'Não deu para ajustar o saldo'),
  })

  const unchanged = parsed === null || parsed === account.current_balance
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (parsed !== null && !unchanged) adjust.mutate(parsed)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-sm" noValidate>
      <Label htmlFor="adjust-balance" className="text-xs text-muted-foreground">
        Ajuste o saldo para bater com o banco. A diferença fica registrada como ajuste manual.
      </Label>
      <div className="flex items-start gap-2">
        <ValueInput
          id="adjust-balance"
          value={text}
          onValueChange={setText}
          onParsedValueChange={setParsed}
          placeholder="0.00"
          wrapperClassName="flex-1"
        />
        <Button type="submit" size="sm" disabled={unchanged || adjust.isPending}>
          {adjust.isPending ? 'Salvando...' : 'Ajustar'}
        </Button>
      </div>
    </form>
  )
}

function StatCard({ label, value, icon, children }: StatCardProps) {
  const inner = (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground/50">{icon}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  )

  if (children) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="text-left w-full cursor-pointer">
            {inner}
          </button>
        </PopoverTrigger>
        {children}
      </Popover>
    )
  }
  return inner
}

export function StatCards({
  account,
  recurringTxns,
  nextPayday,
  friendBreakdown = [],
  safetyBuffer = 0,
}: StatCardsProps) {
  const now = new Date()

  const recurringReserved = recurringTxns
    .filter(isScheduledBill)
    .reduce((sum, t) => sum + Math.abs(effectiveAmount(t)) * countInCurrentPayWindow(t, nextPayday), 0)
    + asNeededReserved(recurringTxns)

  const peerObligations = friendBreakdown.reduce((sum, debt) => {
    if (!debt.next_payment_date) return sum + debt.next_payment
    if (isInCurrentPayWindow(debt.next_payment_date, now, nextPayday)) {
      return sum + debt.next_payment
    }
    return sum
  }, 0)

  const installmentObligations = recurringTxns
    .filter(t =>
      t.is_installment &&
      t.next_occurrence !== null &&
      (t.paid_installments ?? 0) < (t.total_installments ?? 0) &&
      isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const reserved = recurringReserved + peerObligations + installmentObligations
  const liquid = account.current_balance - reserved

  return (
    <div className="grid grid-cols-1 @md:grid-cols-3 gap-3">
      <StatCard
        label="Saldo"
        value={(
          <MoneyValue
            amount={account.current_balance}
            currency={account.currency}
            tone="neutral"
            showSign="auto"
          />
        )}
        icon={<Wallet size={14} />}
      >
        <PopoverContent className="w-72 p-4">
          <AdjustBalanceForm key={account.current_balance} account={account} />
        </PopoverContent>
      </StatCard>
      <StatCard
        label="Reservado"
        value={(
          <MoneyValue
            amount={reserved}
            currency={account.currency}
            tone="neutral"
            showSign="never"
            className="text-[var(--color-risk-medium)]"
          />
        )}
        icon={<ShieldCheck size={14} />}
      >
        <PopoverContent className="w-64 p-4">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Contas recorrentes</span>
              <span className="tabular-nums font-medium">{formatMoney(recurringReserved, account.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Dívidas com amigos (a pagar)</span>
              <span className="tabular-nums font-medium">{formatMoney(peerObligations, account.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Parcelas</span>
              <span className="tabular-nums font-medium">{formatMoney(installmentObligations, account.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Margem de segurança</span>
              <span className="tabular-nums font-medium">{formatMoney(safetyBuffer, account.currency)}</span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex items-center justify-between gap-2">
              <span className="font-semibold">Total reservado</span>
              <span className="tabular-nums font-semibold">{formatMoney(reserved + safetyBuffer, account.currency)}</span>
            </div>
          </div>
        </PopoverContent>
      </StatCard>
      <StatCard
        label="Sobra"
        value={(
          <MoneyValue
            amount={liquid}
            currency={account.currency}
            tone="neutral"
            showSign="auto"
            className={liquid <= 0 ? 'text-[var(--color-verdict-no)]' : 'text-[var(--color-verdict-yes)]'}
          />
        )}
        icon={<Zap size={14} />}
      />
    </div>
  )
}
