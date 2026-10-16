import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CATEGORIES } from '@/domain/categories'
import { fetchCategories, suggestCategory } from '@/lib/api'
import { CategoryField } from './CategoryField'

vi.mock('@/lib/api', () => ({
  fetchCategories: vi.fn(),
  suggestCategory: vi.fn(),
}))

const mockFetchCategories = vi.mocked(fetchCategories)
const mockSuggestCategory = vi.mocked(suggestCategory)

function Harness({ initial = '', title, description = '' }: { initial?: string; title: string; description?: string }) {
  const [value, setValue] = useState(initial)
  return <CategoryField id="cat" value={value} title={title} description={description} onChange={setValue} />
}

function renderField(props: { initial?: string; title: string; description?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  )
}

function input(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input#cat')!
}

beforeEach(() => {
  mockFetchCategories.mockResolvedValue([...DEFAULT_CATEGORIES])
  mockSuggestCategory.mockReset()
  mockSuggestCategory.mockImplementation(async (title) =>
    title === 'Carrefour Hiper' ? { category: 'Mercado', confidence: 0.9 } : null,
  )
})

describe('CategoryField', () => {
  it('offers the known categories as options', async () => {
    const { container } = renderField({ title: '' })

    expect(input(container).getAttribute('list')).toBe('cat-options')
    await waitFor(() => {
      const options = container.querySelectorAll('datalist#cat-options option')
      expect(options).toHaveLength(DEFAULT_CATEGORIES.length)
    })
    expect(container.querySelector('datalist#cat-options option[value="Contas e serviços"]')).not.toBeNull()
  })

  it('suggests a category for the title and description and sets it on click', async () => {
    const user = userEvent.setup()
    const { container } = renderField({ title: 'Carrefour Hiper', description: 'compra do mes' })

    await user.click(await screen.findByRole('button', { name: 'Mercado' }))

    expect(input(container).value).toBe('Mercado')
    expect(screen.queryByRole('button', { name: 'Mercado' })).toBeNull()
    expect(mockSuggestCategory).toHaveBeenCalledWith('Carrefour Hiper', 'compra do mes')
  })

  it('does not suggest once a category is set', async () => {
    renderField({ initial: 'Lazer', title: 'Carrefour Hiper' })

    await waitFor(() => expect(mockFetchCategories).toHaveBeenCalled())
    expect(mockSuggestCategory).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Mercado' })).toBeNull()
  })

  it('does not suggest for an empty title', async () => {
    renderField({ title: '   ', description: 'something' })

    await waitFor(() => expect(mockFetchCategories).toHaveBeenCalled())
    expect(mockSuggestCategory).not.toHaveBeenCalled()
  })
})
