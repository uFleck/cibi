import type { ComponentType } from 'react'
import { WIDGET_META, WALL_SPANS, type WallSpan, type WidgetId, type WidgetMeta } from './meta'
import {
  AccountsBody,
  BudgetBody,
  CategoriesBody,
  CheckBody,
  ReserveBody,
  KpisBody,
  PaydayBody,
  ProjectionBody,
  RecentBody,
  UpcomingBody,
  type WidgetBodyProps,
} from './bodies'
import { FriendLedgerWidget } from './friends/FriendLedgerWidget'
import { GoalsSnapshotWidget } from './goals/GoalsSnapshotWidget'

export interface WidgetDef {
  meta: WidgetMeta
  /** Wall spans this widget may take. Every widget takes the full set for now. */
  spans: readonly WallSpan[]
  component: ComponentType<WidgetBodyProps>
}

const def = (id: WidgetId, component: ComponentType<WidgetBodyProps>): WidgetDef => ({
  meta: WIDGET_META[id],
  spans: WALL_SPANS,
  component,
})

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  kpis: def('kpis', KpisBody),
  projection: def('projection', ProjectionBody),
  budget: def('budget', BudgetBody),
  upcoming: def('upcoming', UpcomingBody),
  recent: def('recent', RecentBody),
  payday: def('payday', PaydayBody),
  goals: def('goals', GoalsSnapshotWidget),
  accounts: def('accounts', AccountsBody),
  categories: def('categories', CategoriesBody),
  check: def('check', CheckBody),
  friends: def('friends', FriendLedgerWidget),
  reserve: def('reserve', ReserveBody),
}
