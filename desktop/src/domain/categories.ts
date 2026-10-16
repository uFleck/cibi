// Transaction categories. A category is free text stored on the transaction; the default set below
// is what the classifier and the form offer, and every other distinct stored value is a custom one.
// The stored value is always the label. The id is a stable key for classifiers and their models.

export interface CategoryOption {
  id: string
  /** The value stored on a transaction. */
  label: string
  /** Short text that describes what goes in the category. Feeds the ML model later. */
  description: string
}

export const DEFAULT_CATEGORIES: readonly CategoryOption[] = [
  { id: 'mercado', label: 'Mercado', description: 'Supermercados, hortifruti, padarias e compras de casa para comer' },
  { id: 'restaurantes', label: 'Restaurantes e delivery', description: 'Restaurantes, lanchonetes, pedidos por aplicativo de entrega' },
  { id: 'transporte', label: 'Transporte', description: 'Aplicativos de corrida, combustível, estacionamento, pedágio e transporte público' },
  { id: 'moradia', label: 'Moradia', description: 'Aluguel, condomínio, IPTU e manutenção da casa' },
  { id: 'contas', label: 'Contas e serviços', description: 'Energia, água, gás, internet, telefone e outros serviços recorrentes' },
  { id: 'saude', label: 'Saúde', description: 'Farmácia, consultas, exames, plano de saúde e academia' },
  { id: 'lazer', label: 'Lazer', description: 'Cinema, shows, jogos, eventos e passeios' },
  { id: 'assinaturas', label: 'Assinaturas', description: 'Serviços de streaming e assinaturas digitais mensais ou anuais' },
  { id: 'compras', label: 'Compras', description: 'Compras online e em lojas de varejo, roupas, eletrônicos e itens gerais' },
  { id: 'educacao', label: 'Educação', description: 'Escola, faculdade, cursos, livros e mensalidades de ensino' },
  { id: 'viagem', label: 'Viagem', description: 'Passagens, hotéis, hospedagem e gastos de viagem' },
  { id: 'impostos', label: 'Impostos e taxas', description: 'Impostos, taxas governamentais, IPVA, DARF e DAS' },
  { id: 'presentes', label: 'Presentes e doações', description: 'Presentes para outras pessoas, doações e contribuições religiosas' },
  { id: 'outros', label: 'Outros', description: 'Qualquer gasto que não se encaixe nas outras categorias' },
]

/** Trims a category; a blank value is no category (null). */
export function normalizeCategory(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/** Custom options for the distinct stored values that are not a default label. */
export function customCategoryOptions(storedValues: readonly string[]): CategoryOption[] {
  const defaults = new Set(DEFAULT_CATEGORIES.map((c) => c.label))
  const seen = new Set<string>()
  const out: CategoryOption[] = []
  for (const raw of storedValues) {
    const label = normalizeCategory(raw)
    if (label === null || defaults.has(label) || seen.has(label)) continue
    seen.add(label)
    out.push({ id: `custom:${label}`, label, description: '' })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/** The defaults, then the custom values already in use. */
export function categoryOptions(storedValues: readonly string[]): CategoryOption[] {
  return [...DEFAULT_CATEGORIES, ...customCategoryOptions(storedValues)]
}
