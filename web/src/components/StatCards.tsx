import { Wallet, ShieldCheck, Zap } from 'lucide-react'
import { formatMoney } from '@/lib/format'
import type { AccountResponse, TransactionResponse } from '@/lib/api'

interface StatCardsProps {
  account: AccountResponse
  recurringTxns: TransactionResponse[]
}

interface StatCardProps {
  label: string
  value: string
  icon: React.ReactNode
  valueStyle?: React.CSSProperties
}

function StatCard({ label, value, icon, valueStyle }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground/50">{icon}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight" style={valueStyle}>
        {value}
      </p>
    </div>
  )
}

export function StatCards({ account, recurringTxns }: StatCardsProps) {
  const reserved = recurringTxns
    .filter(t => t.next_occurrence !== null)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const liquid = account.current_balance - reserved

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard
        label="Balance"
        value={formatMoney(account.current_balance)}
        icon={<Wallet size={14} />}
      />
      <StatCard
        label="Reserved"
        value={formatMoney(reserved)}
        icon={<ShieldCheck size={14} />}
        valueStyle={{ color: 'var(--color-risk-medium)' }}
      />
      <StatCard
        label="Liquid"
        value={formatMoney(liquid)}
        icon={<Zap size={14} />}
        valueStyle={{
          color: liquid <= 0
            ? 'var(--color-verdict-no)'
            : 'var(--color-verdict-yes)',
        }}
      />
    </div>
  )
}
