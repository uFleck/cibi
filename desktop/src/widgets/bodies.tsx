import { StatCards } from './kpis/StatCards'
import { ProjectionWidget } from './projection/ProjectionWidget'
import { ObligationsList } from './upcoming/ObligationsList'
import { LedgerRecentWidget } from './recent/LedgerRecentWidget'
import { PayScheduleList } from './payday/PayScheduleList'
import { PayWindowBar } from './payday/PayWindowBar'
import { AccountsWidget } from './accounts/AccountsWidget'
import { BudgetWidget } from './budget/BudgetWidget'
import { CategoriesWidget } from './categories/CategoriesWidget'
import { CheckWidget } from './check/CheckWidget'
import { ReserveWidget } from './reserve/ReserveWidget'
import { useBufferDollars, useReserve } from './reserve/useReserve'
import { reserveAdjustment } from '@/lib/reserve-adjustment'
import { useSelection } from '@/shell/selection'
import type { WidgetData } from './useWorkspace'

export interface WidgetBodyProps {
  data: WidgetData
}

export function KpisBody({ data }: WidgetBodyProps) {
  const safetyBuffer = useBufferDollars(data.account)
  return (
    <StatCards
      account={data.account}
      recurringTxns={data.transactions}
      nextPayday={data.nextPayday}
      friendBreakdown={data.friendBreakdown}
      safetyBuffer={safetyBuffer}
    />
  )
}

export function ProjectionBody({ data }: WidgetBodyProps) {
  const { data: reserve } = useReserve(data.account.id)
  return (
    <ProjectionWidget
      account={data.account}
      transactions={data.transactions}
      paySchedules={data.paySchedules}
      friendBreakdown={data.friendBreakdown}
      nextPayday={data.nextPayday}
      reserve={reserveAdjustment(reserve)}
    />
  )
}

export function ReserveBody({ data }: WidgetBodyProps) {
  return <ReserveWidget accountId={data.account.id} currency={data.account.currency} />
}

export function BudgetBody({ data }: WidgetBodyProps) {
  return <BudgetWidget currency={data.account.currency} />
}

export function UpcomingBody({ data }: WidgetBodyProps) {
  const { selectedId, select } = useSelection()
  return (
    <ObligationsList
      transactions={data.transactions}
      currency={data.account.currency}
      nextPayday={data.nextPayday}
      selectedId={selectedId}
      onSelect={select}
    />
  )
}

export function RecentBody({ data }: WidgetBodyProps) {
  return <LedgerRecentWidget account={data.account} />
}

export function PaydayBody({ data }: WidgetBodyProps) {
  return (
    <div className="flex flex-col gap-3">
      <PayWindowBar nextPayday={data.nextPayday} paySchedules={data.paySchedules} />
      <PayScheduleList schedules={data.paySchedules} currency={data.account.currency} />
    </div>
  )
}

export function AccountsBody({ data }: WidgetBodyProps) {
  return <AccountsWidget accounts={data.accounts} />
}

export function CategoriesBody({ data }: WidgetBodyProps) {
  return <CategoriesWidget account={data.account} transactions={data.transactions} />
}

export function CheckBody({ data }: WidgetBodyProps) {
  return <CheckWidget accountId={data.account.id} />
}
