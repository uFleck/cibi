import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CategoriesPage } from '@/pages/categories'
import { deleteCategory, fetchCategoryDetails, suggestCategory, updateCategory, type CategoryDetails } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    fetchCategoryDetails: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    suggestCategory: vi.fn(),
  }
})

vi.mock('@/lib/laya', () => ({
  activateLaya: vi.fn(async () => ({ state: 'rules' })),
  warmLaya: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const CATEGORIES: CategoryDetails[] = [
  { id: 'mercado', label: 'Mercado', description: 'Supermercados, hortifruti, padarias e compras de casa para comer', usage: 3 },
  { id: 'custom-pet', label: 'Pet', description: '', usage: 0 },
]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CategoriesPage />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.mocked(fetchCategoryDetails).mockReset().mockResolvedValue(CATEGORIES)
    vi.mocked(updateCategory).mockReset().mockResolvedValue(CATEGORIES[0])
    vi.mocked(deleteCategory).mockReset().mockResolvedValue(undefined)
    vi.mocked(suggestCategory).mockReset()
  })

  it('lists each category with its description and how many transactions use it', async () => {
    renderPage()
    expect(await screen.findByText('Mercado')).toBeTruthy()
    expect(screen.getByText(/Supermercados, hortifruti/)).toBeTruthy()
    expect(screen.getByText('Pet')).toBeTruthy()
    expect(screen.getByText(/No description/)).toBeTruthy()
  })

  it('edits the name and the description of a category', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Mercado' }))

    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Feira')
    expect(screen.getByText(/The 3 transactions in this category move to the new name/)).toBeTruthy()
    const description = screen.getByLabelText('Description for Laya')
    await user.clear(description)
    await user.type(description, 'Feira livre e açougue')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith('mercado', { label: 'Feira', description: 'Feira livre e açougue' }),
    )
  })

  it('resets a built-in description to its default', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Mercado' }))
    const description = (await screen.findByLabelText('Description for Laya')) as HTMLTextAreaElement
    await user.clear(description)
    await user.type(description, 'outra coisa')
    await user.click(screen.getByRole('button', { name: /Reset to default description/ }))
    expect(description.value).toBe(CATEGORIES[0].description)
  })

  it('deletes a category after confirming', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Delete Mercado' }))
    expect(await screen.findByText(/3 transactions will become uncategorized/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith('mercado'))
  })

  it('shows what the classifier picks for a sample title', async () => {
    vi.mocked(suggestCategory).mockResolvedValue({ category: 'Mercado', confidence: 0.9 })
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Sample title'), 'Padaria')
    await user.click(screen.getByRole('button', { name: 'Test' }))
    expect((await screen.findByTestId('try-it-result')).textContent).toBe('Mercado (90% confident)')
  })

  it('says so when the classifier has no confident match', async () => {
    vi.mocked(suggestCategory).mockResolvedValue(null)
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Sample title'), 'Pix Maria')
    await user.click(screen.getByRole('button', { name: 'Test' }))
    expect((await screen.findByTestId('try-it-result')).textContent).toMatch(/No confident match/)
  })
})
