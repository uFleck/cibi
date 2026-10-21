// Widget ids, titles and default wall spans. Pure data (no React) so the layout store can use it.

export const WIDGET_IDS = [
  'kpis',
  'projection',
  'budget',
  'upcoming',
  'recent',
  'payday',
  'goals',
  'accounts',
  'categories',
  'check',
  'friends',
  'reserve',
] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

export const WALL_SPANS = [3, 4, 6, 8, 12] as const

export type WallSpan = (typeof WALL_SPANS)[number]

export interface WidgetMeta {
  id: WidgetId
  title: string
  /** Span on the wall when the widget is added without one. */
  span: WallSpan
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  kpis: { id: 'kpis', title: 'Indicadores principais', span: 12 },
  projection: { id: 'projection', title: 'Projeção', span: 8 },
  budget: { id: 'budget', title: 'Orçamento do mês', span: 6 },
  upcoming: { id: 'upcoming', title: 'Próximas contas', span: 6 },
  recent: { id: 'recent', title: 'Atividade recente', span: 12 },
  payday: { id: 'payday', title: 'Próximo recebimento', span: 4 },
  goals: { id: 'goals', title: 'Metas', span: 4 },
  accounts: { id: 'accounts', title: 'Contas', span: 4 },
  categories: { id: 'categories', title: 'Gastos por categoria', span: 6 },
  check: { id: 'check', title: 'Posso comprar?', span: 4 },
  friends: { id: 'friends', title: 'Extrato de amigos', span: 4 },
  reserve: { id: 'reserve', title: 'Reserva', span: 4 },
}

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value)
}

export function isWallSpan(value: unknown): value is WallSpan {
  return typeof value === 'number' && (WALL_SPANS as readonly number[]).includes(value)
}
