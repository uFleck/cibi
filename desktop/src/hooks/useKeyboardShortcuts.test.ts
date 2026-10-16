import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShortcutRegistry, keyChips, shortcutRegistry, useKeyboardShortcuts, type ShortcutRegistry } from './useKeyboardShortcuts'

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('shortcut registry', () => {
  let registry: ShortcutRegistry
  let detach: () => void

  beforeEach(() => {
    registry = createShortcutRegistry(1000)
    detach = registry.attach(document)
  })

  afterEach(() => {
    detach()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('runs a single key binding and prevents the default action', () => {
    const run = vi.fn()
    registry.register({ keys: 'j', run })

    const event = press('j')

    expect(run).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a plain key when Ctrl or Alt is held', () => {
    const run = vi.fn()
    registry.register({ keys: 'k', run })

    press('k', { ctrlKey: true })
    press('k', { altKey: true })

    expect(run).not.toHaveBeenCalled()
  })

  it('matches Mod bindings with either Ctrl or Meta', () => {
    const run = vi.fn()
    registry.register({ keys: 'Mod+k', run })

    press('k', { ctrlKey: true })
    press('k', { metaKey: true })
    press('k')

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does not fire single keys while typing in inputs, textareas, selects or contenteditable', () => {
    const run = vi.fn()
    registry.register({ keys: 'j', run })
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.append(input, textarea, select, editable)

    for (const element of [input, textarea, select, editable]) {
      press('j', {}, element)
    }

    expect(run).not.toHaveBeenCalled()
  })

  it('still fires single keys from non-text inputs such as checkboxes', () => {
    const run = vi.fn()
    registry.register({ keys: 'j', run })
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    document.body.append(checkbox)

    press('j', {}, checkbox)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('keeps bindings marked allowInInput working while typing', () => {
    const palette = vi.fn()
    const save = vi.fn()
    registry.register({ keys: 'Mod+k', run: palette, allowInInput: true })
    registry.register({ keys: 'Mod+Enter', run: save, scope: 'form', allowInInput: true })
    const input = document.createElement('input')
    document.body.append(input)

    press('k', { ctrlKey: true }, input)
    press('Enter', { ctrlKey: true }, input)

    expect(palette).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('suppresses single keys while a dialog is open', () => {
    const run = vi.fn()
    registry.register({ keys: 'n', run })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('data-state', 'open')
    document.body.append(dialog)

    press('n')
    dialog.remove()
    press('n')

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('suppresses single keys while an alert dialog is open', () => {
    const run = vi.fn()
    registry.register({ keys: 'd', run })
    const alert = document.createElement('div')
    alert.setAttribute('role', 'alertdialog')
    alert.setAttribute('data-state', 'open')
    document.body.append(alert)

    press('d')
    alert.remove()
    press('d')

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('ignores auto-repeated keydown events and cancels a pending chord', () => {
    const single = vi.fn()
    const chord = vi.fn()
    registry.register({ keys: 't', run: single })
    registry.register({ keys: 'g d', run: chord })

    press('t', { repeat: true })
    expect(single).not.toHaveBeenCalled()

    press('g')
    press('d', { repeat: true })
    expect(chord).not.toHaveBeenCalled()
    expect(registry.getChord()).toBeNull()
  })

  it('gives the most specific scope priority when keys collide', () => {
    const global = vi.fn()
    const list = vi.fn()
    const form = vi.fn()
    registry.register({ keys: 'x', run: global })
    registry.register({ keys: 'x', run: list, scope: 'list' })
    registry.register({ keys: 'x', run: form, scope: 'form' })

    press('x')

    expect(form).toHaveBeenCalledTimes(1)
    expect(list).not.toHaveBeenCalled()
    expect(global).not.toHaveBeenCalled()
  })

  it('lets the most recent registration win within the same scope', () => {
    const first = vi.fn()
    const second = vi.fn()
    registry.register({ keys: 'x', run: first })
    registry.register({ keys: 'x', run: second })

    press('x')

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('stops firing a binding after it is unregistered', () => {
    const run = vi.fn()
    const unregister = registry.register({ keys: 'x', run })

    unregister()
    press('x')

    expect(run).not.toHaveBeenCalled()
    expect(registry.list()).toHaveLength(0)
  })

  it('runs a two step chord', () => {
    const run = vi.fn()
    registry.register({ keys: 'g d', run })

    press('g')
    expect(registry.getChord()).not.toBeNull()
    press('d')

    expect(run).toHaveBeenCalledTimes(1)
    expect(registry.getChord()).toBeNull()
  })

  it('exposes chord options with their labels while pending', () => {
    registry.register({ keys: 'g d', label: 'Overview', run: vi.fn() })
    registry.register({ keys: 'g t', label: 'Transactions', run: vi.fn() })

    press('g')

    expect(registry.getChord()).toEqual({
      keys: 'g',
      options: [
        { keys: 'd', label: 'Overview' },
        { keys: 't', label: 'Transactions' },
      ],
    })
  })

  it('cancels a pending chord when an unrelated key follows', () => {
    const run = vi.fn()
    registry.register({ keys: 'g d', run })

    press('g')
    press('x')
    press('d')

    expect(run).not.toHaveBeenCalled()
    expect(registry.getChord()).toBeNull()
  })

  it('cancels a pending chord when the chord timeout elapses', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    registry.register({ keys: 'g d', run })

    press('g')
    vi.advanceTimersByTime(999)
    expect(registry.getChord()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(registry.getChord()).toBeNull()

    press('d')
    expect(run).not.toHaveBeenCalled()
  })

  it('cancels a pending chord on Escape', () => {
    const run = vi.fn()
    registry.register({ keys: 'g d', run })

    press('g')
    press('Escape')
    press('d')

    expect(run).not.toHaveBeenCalled()
    expect(registry.getChord()).toBeNull()
  })

  it('does not start a chord while typing', () => {
    registry.register({ keys: 'g d', run: vi.fn() })
    const input = document.createElement('input')
    document.body.append(input)

    press('g', {}, input)

    expect(registry.getChord()).toBeNull()
  })

  it('notifies chord subscribers when the chord starts and ends', () => {
    vi.useFakeTimers()
    registry.register({ keys: 'g d', run: vi.fn() })
    const listener = vi.fn()
    const unsubscribe = registry.subscribeChord(listener)

    press('g')
    press('d')
    unsubscribe()
    press('g')

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops listening when detached', () => {
    const run = vi.fn()
    registry.register({ keys: 'x', run })

    detach()
    press('x')

    expect(run).not.toHaveBeenCalled()
    detach = registry.attach(document)
  })

  it('ignores events that were already handled', () => {
    const run = vi.fn()
    registry.register({ keys: 'x', run })
    document.addEventListener('keydown', event => event.preventDefault(), { once: true, capture: true })

    press('x')

    expect(run).not.toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts', () => {
  it('keeps one registration per binding across rerenders and dispatches to the latest run', () => {
    const detach = shortcutRegistry.attach(document)
    const first = vi.fn()
    const second = vi.fn()
    const before = shortcutRegistry.list().length

    const { rerender, unmount } = renderHook(
      ({ run }: { run: () => void }) => useKeyboardShortcuts([{ keys: 'y', run }]),
      { initialProps: { run: first } },
    )
    const registered = shortcutRegistry.list().length - before
    rerender({ run: second })
    rerender({ run: second })

    expect(shortcutRegistry.list().length - before).toBe(registered)
    press('y')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)

    unmount()
    detach()
  })

  it('registers bindings while mounted and removes them on unmount', () => {
    const detach = shortcutRegistry.attach(document)
    const run = vi.fn()

    const { unmount } = renderHook(() => useKeyboardShortcuts([{ keys: 'z', run, scope: 'list' }]))
    press('z')
    expect(run).toHaveBeenCalledTimes(1)

    unmount()
    press('z')
    expect(run).toHaveBeenCalledTimes(1)
    detach()
  })
})

describe('keyChips', () => {
  it('splits modifiers and chord steps into chip labels', () => {
    expect(keyChips('Mod+k')).toEqual(['Ctrl', 'K'])
    expect(keyChips('g d')).toEqual(['G', 'D'])
    expect(keyChips('Escape')).toEqual(['Esc'])
    expect(keyChips('Mod+Enter')).toEqual(['Ctrl', '↵'])
  })
})
