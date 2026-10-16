import type { CategoryOption } from '../categories'
import type { Classification, Classifier } from './types'

/** Keywords and merchants per default category id. Terms are matched on normalized text (see matchTerm). */
const RULES: ReadonlyArray<{ id: string; terms: readonly string[] }> = [
  {
    id: 'mercado',
    terms: ['carrefour', 'pao de acucar', 'atacadao', 'assai', 'supermercado', 'mercado', 'mercadinho', 'hortifruti', 'padaria', 'sacolao'],
  },
  {
    id: 'restaurantes',
    terms: ['ifood', 'rappi', 'restaurante', 'lanchonete', 'uber eats', 'mcdonalds', 'burger king', 'subway', 'outback', 'pizzaria', 'pizza', 'hamburgueria', 'sushi', 'acai'],
  },
  {
    id: 'transporte',
    terms: ['uber', '99app', '99pop', 'cabify', 'combustivel', 'gasolina', 'posto', 'ipiranga', 'shell', 'petrobras', 'estacionamento', 'pedagio', 'sem parar', 'onibus', 'metro', 'taxi'],
  },
  { id: 'moradia', terms: ['aluguel', 'condominio', 'iptu', 'imobiliaria'] },
  {
    id: 'contas',
    terms: ['luz', 'enel', 'cemig', 'copel', 'agua', 'sabesp', 'internet', 'vivo', 'claro', 'tim', 'virtua', 'comgas', 'ultragaz', 'telefone', 'celular'],
  },
  {
    id: 'saude',
    terms: ['farmacia', 'drogasil', 'drogaria', 'droga raia', 'pague menos', 'consulta', 'plano de saude', 'hospital', 'laboratorio', 'dentista', 'clinica', 'academia', 'unimed', 'exame', 'fisioterapia', 'psicologo'],
  },
  { id: 'lazer', terms: ['cinema', 'cinemark', 'ingresso', 'show', 'teatro', 'parque', 'sympla', 'steam', 'playstation', 'xbox', 'boliche'] },
  {
    id: 'assinaturas',
    terms: ['netflix', 'spotify', 'youtube', 'prime', 'amazon prime', 'disney', 'hbo', 'globoplay', 'deezer', 'apple music', 'icloud', 'chatgpt', 'openai', 'adobe', 'dropbox', 'crunchyroll', 'microsoft 365'],
  },
  {
    id: 'compras',
    terms: ['mercado livre', 'mercado pago', 'amazon', 'shopee', 'magalu', 'magazine luiza', 'aliexpress', 'shein', 'americanas', 'casas bahia', 'kabum'],
  },
  {
    id: 'educacao',
    terms: ['escola', 'faculdade', 'universidade', 'curso', 'cursos', 'mensalidade', 'udemy', 'alura', 'coursera', 'livraria', 'colegio'],
  },
  { id: 'viagem', terms: ['hotel', 'hoteis', 'passagem', 'passagens', 'airbnb', 'latam', 'decolar', 'booking', 'cvc', 'viagem', 'hospedagem'] },
  { id: 'impostos', terms: ['imposto', 'impostos', 'taxa', 'taxas', 'ipva', 'darf', 'das mei', 'iof', 'inss', 'receita federal', 'detran'] },
  { id: 'presentes', terms: ['presente', 'presentes', 'doacao', 'doacoes', 'vakinha', 'dizimo', 'igreja'] },
]

const CONFIDENCE = 0.9
const MIN_PREFIX_LENGTH = 7

interface Analyzed {
  tokens: string[]
  compact: string
}

/** Lowercase, accents removed, split on anything that is not a letter or digit. */
function analyze(s: string): Analyzed {
  const tokens = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== '')
  return { tokens, compact: tokens.join('') }
}

const COMPILED = RULES.map((rule) => ({ id: rule.id, terms: rule.terms.map(analyze) }))

/**
 * A multi-word term matches when its letters appear in a row, so "mercado livre" matches
 * "MERCADOLIVRE*123". A one-word term matches a whole word, or the start of a word of at least
 * seven letters, so "amazonia" is not "amazon", and "primeira" is not "prime".
 */
function matchTerm(text: Analyzed, term: Analyzed): boolean {
  if (term.tokens.length > 1) return text.compact.includes(term.compact)
  const [word] = term.tokens
  return text.tokens.some((t) => t === word || (word.length >= MIN_PREFIX_LENGTH && t.startsWith(word)))
}

/**
 * The category whose longest matching term is the longest overall. Two categories that tie on
 * that length are ambiguous, and so is no match.
 */
export const rulesClassifier: Classifier = {
  async classify(description: string, categories: CategoryOption[]): Promise<Classification | null> {
    const text = analyze(description)
    if (text.tokens.length === 0) return null
    const known = new Set(categories.map((c) => c.id))

    let bestLength = 0
    let bestIds: string[] = []
    for (const rule of COMPILED) {
      if (!known.has(rule.id)) continue
      let ruleLength = 0
      for (const term of rule.terms) {
        if (matchTerm(text, term)) ruleLength = Math.max(ruleLength, term.compact.length)
      }
      if (ruleLength === 0) continue
      if (ruleLength > bestLength) {
        bestLength = ruleLength
        bestIds = [rule.id]
      } else if (ruleLength === bestLength) {
        bestIds.push(rule.id)
      }
    }
    if (bestIds.length !== 1) return null
    const option = categories.find((c) => c.id === bestIds[0])
    return option ? { category: option.label, confidence: CONFIDENCE } : null
  },
}
