import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoneyValue } from '@/components/ui/money-value'

describe('MoneyValue', () => {
  it("renders '+' prefix when showSign='always' and amount is positive", () => {
    render(<MoneyValue amount={120} showSign="always" />)

    expect(screen.getByText(/^\+R\$/)).toBeTruthy()
  })

  it("renders no sign when showSign='never' and amount is negative", () => {
    render(<MoneyValue amount={-120} showSign="never" />)

    const value = screen.getByText(/^R\$/)
    expect(value.textContent?.startsWith('-')).toBe(false)
    expect(value.textContent?.startsWith('+')).toBe(false)
  })

  it("maps tone='positive' to text-green-600", () => {
    render(<MoneyValue amount={10} tone="positive" />)

    expect(screen.getByText(/R\$/).className).toContain('text-green-600')
  })

  it("maps tone='negative' to text-red-500", () => {
    render(<MoneyValue amount={-10} tone="negative" />)

    expect(screen.getByText(/R\$/).className).toContain('text-red-500')
  })

  it("maps tone='neutral' to text-muted-foreground", () => {
    render(<MoneyValue amount={10} tone="neutral" />)

    expect(screen.getByText(/R\$/).className).toContain('text-muted-foreground')
  })

  it('formats USD with dollar symbol in pt-BR locale', () => {
    render(<MoneyValue amount={120} currency="USD" />)

    expect(screen.getByText(/US\$/)).toBeTruthy()
  })

  it("hides sign by default for negative amount", () => {
    render(<MoneyValue amount={-120} />)

    const value = screen.getByText(/^R\$/)
    expect(value.textContent?.startsWith('-')).toBe(false)
    expect(value.textContent?.startsWith('+')).toBe(false)
  })
})
