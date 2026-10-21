import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LayoutProvider } from './LayoutProvider'
import { useLayout } from './layoutContext'
import { BASE_KEY, DEFAULT_INSPECTOR, LAYOUT_KEY, LAYOUT_QUERY_KEY, SAVE_DELAY_MS, initialLayoutState } from './layoutStore'

const apiMock = vi.hoisted(() => ({ getSetting: vi.fn(), putSetting: vi.fn() }))

vi.mock('@/lib/api', () => apiMock)

function Probe() {
  const layout = useLayout()
  if (!layout) return <p>loading</p>
  return (
    <div>
      <p>ready</p>
      <pre data-testid="state">{JSON.stringify(layout.state)}</pre>
      <button type="button" onClick={() => layout.dispatch({ type: 'setPos', pos: 'left' })}>
        Esquerda
      </button>
    </div>
  )
}

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <LayoutProvider>
        <Probe />
      </LayoutProvider>
    </QueryClientProvider>,
  )
  return client
}

const savedState = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}')
const wait = (ms: number) => act(() => new Promise(resolve => setTimeout(resolve, ms)))

const stored = {
  layout: { pos: 'off', wall: [{ id: 'kpis', span: 12 }], insp: [{ id: 'goals' }] },
  base: 'w3',
}

beforeEach(() => {
  apiMock.getSetting.mockResolvedValue(null)
  apiMock.putSetting.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LayoutProvider', () => {
  it('starts from the defaults when nothing is saved, and does not write on load', async () => {
    renderProvider()
    await screen.findByText('ready')
    expect(savedState()).toEqual(initialLayoutState())
    expect(savedState().layout.insp.map((item: { id: string }) => item.id)).toEqual(DEFAULT_INSPECTOR)

    await wait(SAVE_DELAY_MS + 100)
    expect(apiMock.putSetting).not.toHaveBeenCalled()
  })

  it('sanitizes a saved layout: unknown ids, duplicates and invalid spans are dropped or defaulted', async () => {
    apiMock.getSetting.mockImplementation((key: string) =>
      Promise.resolve(
        key === BASE_KEY
          ? 'w3'
          : {
              pos: 'off',
              wall: [
                { id: 'kpis', span: 5 },
                { id: 'gone', span: 12 },
                { id: 'kpis', span: 3 },
              ],
              insp: [{ id: 'goals' }, { id: 'nope' }],
            },
      ),
    )
    renderProvider()
    await screen.findByText('ready')
    expect(savedState()).toEqual({
      layout: {
        pos: 'off',
        wall: [{ id: 'kpis', span: 12 }],
        insp: [{ id: 'goals' }],
      },
      base: 'w3',
    })
  })

  it('saves one debounced write of the layout and the base preset after a change', async () => {
    renderProvider()
    await screen.findByText('ready')
    fireEvent.click(screen.getByRole('button', { name: 'Esquerda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Esquerda' }))
    await waitFor(() => expect(apiMock.putSetting).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(apiMock.putSetting).toHaveBeenCalledWith(LAYOUT_KEY, expect.objectContaining({ pos: 'left' }))
    expect(apiMock.putSetting).toHaveBeenCalledWith(BASE_KEY, 'w1')
  })

  it('a failed first load shows the defaults and does not overwrite the stored layout, even after a recovered refetch', async () => {
    let online = false
    apiMock.getSetting.mockImplementation((key: string) => {
      if (!online) return Promise.reject(new Error('offline'))
      return Promise.resolve(key === BASE_KEY ? stored.base : stored.layout)
    })
    const client = renderProvider()
    await screen.findByText('ready', undefined, { timeout: 3000 })
    expect(savedState()).toEqual(initialLayoutState())

    online = true
    await client.refetchQueries({ queryKey: LAYOUT_QUERY_KEY })
    fireEvent.click(screen.getByRole('button', { name: 'Esquerda' }))
    await wait(SAVE_DELAY_MS + 100)
    expect(apiMock.putSetting).not.toHaveBeenCalled()
  })

  it('flushes a pending save immediately when the page is hidden', async () => {
    renderProvider()
    await screen.findByText('ready')
    fireEvent.click(screen.getByRole('button', { name: 'Esquerda' }))
    window.dispatchEvent(new Event('pagehide'))
    expect(apiMock.putSetting).toHaveBeenCalledWith(LAYOUT_KEY, expect.objectContaining({ pos: 'left' }))
    expect(apiMock.putSetting).toHaveBeenCalledWith(BASE_KEY, 'w1')
  })
})
