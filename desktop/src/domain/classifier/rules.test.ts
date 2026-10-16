import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../categories'
import { rulesClassifier } from './rules'

async function categorize(description: string): Promise<string | null> {
  return (await rulesClassifier.classify(description, [...DEFAULT_CATEGORIES]))?.category ?? null
}

describe('rulesClassifier', () => {
  it.each([
    ['Mercado Livre', 'Compras'],
    ['MERCADOLIVRE*12345', 'Compras'],
    ['mercado livre', 'Compras'],
    ['Supermercado Extra', 'Mercado'],
    ['Carrefour Hiper', 'Mercado'],
    ['Pão de Açúcar', 'Mercado'],
    ['ATACADÃO', 'Mercado'],
    ['Mercadinho do Zé', 'Mercado'],
    ['Padaria Central', 'Mercado'],
    ['IFOOD *RESTAURANTE', 'Restaurantes e delivery'],
    ['Lanchonete do bairro', 'Restaurantes e delivery'],
    ['Uber Eats', 'Restaurantes e delivery'],
    ['Uber *TRIP', 'Transporte'],
    ['Posto Shell', 'Transporte'],
    ['Estacionamento Shopping', 'Transporte'],
    ['Netflix.com', 'Assinaturas'],
    ['Spotify', 'Assinaturas'],
    ['Amazon Prime', 'Assinaturas'],
    ['Amazon Marketplace', 'Compras'],
    ['Aluguel Outubro', 'Moradia'],
    ['Condomínio Edifício Sol', 'Moradia'],
    ['Conta de luz Enel', 'Contas e serviços'],
    ['Vivo Fibra', 'Contas e serviços'],
    ['Drogasil Centro', 'Saúde'],
    ['Farmácia Pague Menos', 'Saúde'],
    ['Consulta dermatologista', 'Saúde'],
    ['Cinemark Iguatemi', 'Lazer'],
    ['Escola Municipal', 'Educação'],
    ['Mensalidade faculdade', 'Educação'],
    ['Hotel Fasano', 'Viagem'],
    ['IPVA 2026', 'Impostos e taxas'],
    ['Imposto de renda', 'Impostos e taxas'],
    ['Presente aniversário', 'Presentes e doações'],
  ])('%s is %s', async (description, expected) => {
    expect(await categorize(description)).toBe(expected)
  })

  it('ignores case and accents', async () => {
    expect(await categorize('PÃO DE ACUCAR')).toBe('Mercado')
    expect(await categorize('pao de acucar')).toBe('Mercado')
    expect(await categorize('Farmácia')).toBe('Saúde')
    expect(await categorize('FARMACIA')).toBe('Saúde')
  })

  it('prefers the longer merchant over the shorter keyword it contains', async () => {
    expect(await categorize('Uber Eats')).toBe('Restaurantes e delivery')
    expect(await categorize('Amazon Prime Video')).toBe('Assinaturas')
    expect(await categorize('Mercado Livre')).toBe('Compras')
  })

  it('matches a word inside a longer token only from seven letters on', async () => {
    expect(await categorize('Mercadinho')).toBe('Mercado')
    expect(await categorize('Cinemark')).toBe('Lazer')
    expect(await categorize('Spotifyxx')).toBe('Assinaturas')
    expect(await categorize('Primeira parcela')).toBeNull()
    expect(await categorize('Imposto sobre serviço')).toBe('Impostos e taxas')
    expect(await categorize('Imposto')).toBe('Impostos e taxas')
  })

  it('matches a six-letter merchant only as a whole word', async () => {
    expect(await categorize('Amazon')).toBe('Compras')
    expect(await categorize('Amazon.com.br')).toBe('Compras')
    expect(await categorize('Amazonia Turismo')).toBeNull()
    expect(await categorize('Amazonas Store')).toBeNull()
  })

  it('matches Mercado Pago as a merchant, not as the Mercado category', async () => {
    expect(await categorize('Mercado Pago')).toBe('Compras')
    expect(await categorize('MERCADOPAGO*LOJA')).toBe('Compras')
    expect(await categorize('Mercado Central')).toBe('Mercado')
  })

  it('does not match a short word inside another word', async () => {
    expect(await categorize('Ultra Saúde')).toBeNull()
    expect(await categorize('Setim')).toBeNull()
    expect(await categorize('Tim')).toBe('Contas e serviços')
  })

  it('returns null when two categories tie on the longest match', async () => {
    expect(await categorize('iFood posto')).toBeNull()
  })

  it('returns null when nothing matches', async () => {
    expect(await categorize('Pix recebido Maria')).toBeNull()
    expect(await categorize('Transferência para João')).toBeNull()
    expect(await categorize('Parcela 2/99')).toBeNull()
  })

  it('returns null for a blank description', async () => {
    expect(await categorize('')).toBeNull()
    expect(await categorize('   ')).toBeNull()
    expect(await categorize('*-.')).toBeNull()
  })

  it('answers with a label from the options it was given, at 0.9 confidence', async () => {
    const result = await rulesClassifier.classify('Carrefour', [...DEFAULT_CATEGORIES])
    expect(result).toEqual({ category: 'Mercado', confidence: 0.9 })
  })

  it('only matches categories that are among the options', async () => {
    const onlyLazer = DEFAULT_CATEGORIES.filter((c) => c.id === 'lazer')
    expect(await rulesClassifier.classify('Netflix', onlyLazer)).toBeNull()
    expect(await rulesClassifier.classify('Cinema', onlyLazer)).toEqual({ category: 'Lazer', confidence: 0.9 })
  })
})
