// Portuguese labels for values stored in English. The stored values never change; only what is shown.

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Semanal',
  'bi-weekly': 'Quinzenal',
  biweekly: 'Quinzenal',
  'semi-monthly': 'Duas vezes no mês',
  monthly: 'Mensal',
  yearly: 'Anual',
}

const GOAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  completed: 'Concluída',
  archived: 'Arquivada',
}

const GOAL_ENTRY_TYPE_LABELS: Record<string, string> = {
  contribution: 'Aporte',
  withdrawal: 'Retirada',
  adjustment: 'Ajuste',
}

const GOAL_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  recurring: 'Recorrente',
}

const labelOf = (labels: Record<string, string>) => (value: string | null | undefined): string =>
  value == null ? '-' : labels[value] ?? value

export const frequencyLabel = labelOf(FREQUENCY_LABELS)
export const goalStatusLabel = labelOf(GOAL_STATUS_LABELS)
export const goalEntryTypeLabel = labelOf(GOAL_ENTRY_TYPE_LABELS)
export const goalSourceLabel = labelOf(GOAL_SOURCE_LABELS)
