import { describe, expect, it } from 'vitest'
import { cleanLinks, linkText, normalizeUrl } from './links'

describe('normalizeUrl', () => {
  it('adds https when there is no scheme and keeps one that is there', () => {
    expect(normalizeUrl('  www.receita.fazenda.gov.br/pgdas ')).toBe('https://www.receita.fazenda.gov.br/pgdas')
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeUrl('   ')).toBe('')
  })
})

describe('cleanLinks', () => {
  it('drops rows without a url and trims labels', () => {
    expect(
      cleanLinks([
        { url: '', label: 'empty' },
        { url: 'example.com', label: '  Pay  ' },
        { url: 'https://b.example', label: ' ' },
      ]),
    ).toEqual([
      { url: 'https://example.com', label: 'Pay' },
      { url: 'https://b.example', label: null },
    ])
  })
})

describe('linkText', () => {
  it('shows the label, else the url without its scheme', () => {
    expect(linkText({ url: 'https://example.com/a/', label: 'Pay' })).toBe('Pay')
    expect(linkText({ url: 'https://example.com/a/', label: null })).toBe('example.com/a')
  })
})
