import { Wallet, ShieldCheck, Zap } from 'lucide-react'
import { MoneyValue } from '@/components/ui/money-value'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { isInCurrentPayWindow } from '@/lib/financial-window'
import { formatMoney } from '@/lib/format'
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
    .filter(
      t => t.is_recurring && t.next_occurrence !== null
        && isInCurrentPayWindow(t.next_occurrence, now, nextPayday),
    )
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard
        label="Balance"
        value={(
          <MoneyValue
            amount={account.current_balance}
            currency={account.currency}
            tone="neutral"
            showSign="auto"
          />
        )}
        icon={<Wallet size={14} />}
      />
      <StatCard
        label="Reserved"
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
              <span className="text-muted-foreground">Recurring obligations</span>
              <span className="tabular-nums font-medium">{formatMoney(recurringReserved, account.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Peer debts (owed)</span>
              <span className="tabular-nums font-medium">{formatMoney(peerObligations, account.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Installment obligations</span>
              <span className="tabular-nums font-medium">{formatMoney(installmentObligations, account.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Safety buffer</span>
              <span className="tabular-nums font-medium">{formatMoney(safetyBuffer, account.currency)}</span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex items-center justify-between gap-2">
              <span className="font-semibold">Total reserved</span>
              <span className="tabular-nums font-semibold">{formatMoney(reserved + safetyBuffer, account.currency)}</span>
            </div>
          </div>
        </PopoverContent>
      </StatCard>
      <StatCard
        label="Liquid"
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
