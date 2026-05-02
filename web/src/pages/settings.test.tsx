import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '@/pages/settings'
import { AccountContext } from '@/App'
import { fetchAccounts, fetchProfile, updateAccount, updateProfile } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    fetchProfile: vi.fn(),
    updateProfile: vi.fn(),
    fetchAccounts: vi.fn(),
    updateAccount: vi.fn(),
  }
})

const toastSuccessMock = vi.hoisted(() => vi.fn())
const toastErrorMock = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

const mockFetchProfile = vi.mocked(fetchProfile)
const mockUpdateProfile = vi.mocked(updateProfile)
const mockFetchAccounts = vi.mocked(fetchAccounts)
const mockUpdateAccount = vi.mocked(updateAccount)

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountContext.Provider value={{ selectedAccountId: 'acct-1', setSelectedAccountId: vi.fn() }}>
        <SettingsPage />
      </AccountContext.Provider>
    </QueryClientProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    mockFetchProfile.mockReset()
    mockUpdateProfile.mockReset()
    mockFetchAccounts.mockReset()
    mockUpdateAccount.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    mockFetchProfile.mockResolvedValue({ display_name: 'Jane', pix_key: 'jane@pix.test', theme: 'neutral-command' })
    mockFetchAccounts.mockResolvedValue([
      {
        id: 'acct-1',
        name: 'Main',
        current_balance: 500,
        currency: 'USD',
        is_default: true,
        safety_buffer: 120,
      },
    ])
    mockUpdateProfile.mockResolvedValue()
    mockUpdateAccount.mockResolvedValue({
      id: 'acct-1',
      name: 'Main',
      current_balance: 500,
      currency: 'USD',
      is_default: true,
      safety_buffer: 120,
    })
  })

  it('loads profile and selected account safety buffer', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('Jane')).toBeTruthy()
    expect(screen.getByDisplayValue('jane@pix.test')).toBeTruthy()
    expect(await screen.findByDisplayValue('120')).toBeTruthy()
  })

  it('saves safety buffer through updateAccount for selected account', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = await screen.findByLabelText('Safety buffer ($)')
    await user.click(input)
    await user.keyboard('{Control>}a{/Control}{Backspace}250.5')

    await user.click(screen.getByRole('button', { name: 'Save safety buffer' }))

    await waitFor(() => {
      expect(mockUpdateAccount).toHaveBeenCalledWith('acct-1', { safety_buffer: 250.5 })
    })
    expect(toastSuccessMock).toHaveBeenCalledWith('Safety buffer saved')
  })

  it('keeps profile save behavior unchanged', async () => {
    const user = userEvent.setup()
    renderPage()

    const displayNameInput = await screen.findByLabelText('Display name *')
    const pixKeyInput = screen.getByLabelText('PIX key (optional)')

    await user.click(displayNameInput)
    await user.keyboard('{Control>}a{/Control}{Backspace}Jane Doe')
    await user.click(pixKeyInput)
    await user.keyboard('{Control>}a{/Control}{Backspace}jane.doe@pix.test')

    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('acct-1', {
        display_name: 'Jane Doe',
        pix_key: 'jane.doe@pix.test',
        theme: 'neutral-command',
      })
    })
  })
})
