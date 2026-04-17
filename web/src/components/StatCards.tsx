import { Wallet, ShieldCheck, Zap } from 'lucide-react'
import { MoneyValue } from '@/components/ui/money-value'
import { isInCurrentPayWindow } from '@/lib/financial-window'
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
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
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
}

export function StatCards({
  account,
  recurringTxns,
  nextPayday,
  friendBreakdown = [],
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

  const reserved = recurringReserved + peerObligations
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
      />
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
