import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shortcutRegistry } from '@/hooks/useKeyboardShortcuts'
import { EditSheet } from './EditSheet'

describe('EditSheet', () => {
  let detach: () => void

  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    detach = shortcutRegistry.attach(document)
  })

  afterEach(() => {
    detach()
    cleanup()
  })

  it('submits the open form with Ctrl+Enter from a field', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <EditSheet open onOpenChange={vi.fn()} title="Edit transaction">
        <form onSubmit={onSubmit}>
          <input aria-label="Description" />
        </form>
      </EditSheet>,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Description' }), { key: 'Enter', ctrlKey: true })

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit while the submit button is disabled', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <EditSheet open onOpenChange={vi.fn()} title="Edit transaction">
        <form onSubmit={onSubmit}>
          <input aria-label="Description" />
          <button type="submit" disabled>Save</button>
        </form>
      </EditSheet>,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Description' }), { key: 'Enter', ctrlKey: true })

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
