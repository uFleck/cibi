import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, normalizeCategory } from './categories'

describe('DEFAULT_CATEGORIES', () => {
  it('has 14 distinct categories, each with a description', () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(14)
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(14)
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.label)).size).toBe(14)
    for (const c of DEFAULT_CATEGORIES) expect(c.description.trim()).not.toBe('')
  })

  it('uses the pt-BR labels of the app', () => {
    const labels = DEFAULT_CATEGORIES.map((c) => c.label)
    expect(labels).toContain('Contas e serviços')
    expect(labels).toContain('Saúde')
    expect(labels).toContain('Presentes e doações')
    expect(labels).toContain('Outros')
  })
})

describe('normalizeCategory', () => {
  it('trims a value and turns a blank one into null', () => {
    expect(normalizeCategory('  Lazer ')).toBe('Lazer')
    expect(normalizeCategory('')).toBeNull()
    expect(normalizeCategory('   ')).toBeNull()
    expect(normalizeCategory(null)).toBeNull()
    expect(normalizeCategory(undefined)).toBeNull()
  })
})
