import { StatCards } from './kpis/StatCards'
import { ProjectionWidget } from './projection/ProjectionWidget'
import { ObligationsList } from './upcoming/ObligationsList'
import { LedgerRecentWidget } from './recent/LedgerRecentWidget'
import { PayScheduleList } from './payday/PayScheduleList'
import { PayWindowBar } from './payday/PayWindowBar'
import { AccountsWidget } from './accounts/AccountsWidget'
import { CategoriesWidget } from './categories/CategoriesWidget'
import { CheckWidget } from './check/CheckWidget'
import type { WidgetData } from './useWorkspace'

export interface WidgetBodyProps {
  data: WidgetData
}

export function KpisBody({ data }: WidgetBodyProps) {
  return (
    <StatCards
      account={data.account}
      recurringTxns={data.transactions}
      nextPayday={data.nextPayday}
      friendBreakdown={data.friendBreakdown}
      safetyBuffer={data.account.safety_buffer ?? 0}
    />
  )
}

export function ProjectionBody({ data }: WidgetBodyProps) {
  return (
    <ProjectionWidget
      account={data.account}
      transactions={data.transactions}
      paySchedules={data.paySchedules}
      friendBreakdown={data.friendBreakdown}
      nextPayday={data.nextPayday}
    />
  )
}

export function BudgetBody() {
  return <p className="text-sm text-muted-foreground">Monthly budget limits arrive in the next update.</p>
}

export function UpcomingBody({ data }: WidgetBodyProps) {
  return <ObligationsList transactions={data.transactions} currency={data.account.currency} nextPayday={data.nextPayday} />
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
