import { useEffect, useRef } from 'react'

export type ShortcutScope = 'global' | 'list' | 'form'

export interface ShortcutBinding {
  keys: string
  run: (event: KeyboardEvent) => void
  scope?: ShortcutScope
  label?: string
  group?: string
  allowInInput?: boolean
  /** Skip when focus is on a button, link or other control, so its native activation still works. */
  skipInteractive?: boolean
}

export interface ChordOption {
  keys: string
  label: string
}

export interface ChordState {
  keys: string
  options: ChordOption[]
}

export interface ShortcutRegistry {
  register: (binding: ShortcutBinding) => () => void
  list: () => ShortcutBinding[]
  attach: (target: EventTarget) => () => void
  getChord: () => ChordState | null
  subscribeChord: (listener: () => void) => () => void
}

interface Step {
  key: string
  mod: boolean
  alt: boolean
}

interface Entry extends ShortcutBinding {
  id: number
  scope: ShortcutScope
  steps: Step[]
}

const SCOPE_RANK: Record<ShortcutScope, number> = { global: 0, list: 1, form: 2 }
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'])
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit'])
const OVERLAY_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="listbox"], [role="menu"]'
const KEY_LABELS: Partial<Record<string, string>> = { Escape: 'Esc', Enter: '↵', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Space' }

function normalizeKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key
}

function parseKeys(keys: string): Step[] {
  return keys.trim().split(/\s+/).map(token => {
    const parts = token.split('+')
    const key = parts.pop() ?? ''
    return { key: normalizeKey(key), mod: parts.includes('Mod'), alt: parts.includes('Alt') }
  })
}

function toStep(event: KeyboardEvent): Step | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  return { key: normalizeKey(event.key), mod: event.ctrlKey || event.metaKey, alt: event.altKey }
}

function sameStep(a: Step, b: Step) {
  return a.key === b.key && a.mod === b.mod && a.alt === b.alt
}

function startsWith(steps: Step[], prefix: Step[]) {
  return prefix.every((step, index) => steps[index] !== undefined && sameStep(steps[index], step))
}

function isTypingTarget(target: EventTarget | null) {
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type)
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLElement
    && (target.isContentEditable || target.closest('[contenteditable]:not([contenteditable="false"])') !== null)
}

function isOverlayOpen() {
  return document.querySelector(OVERLAY_SELECTOR) !== null
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest('button, a[href], [role="button"], [role="option"], [role="switch"], [role="checkbox"]') !== null
}

function best(list: Entry[]) {
  return list.reduce((top, entry) => {
    const rank = SCOPE_RANK[entry.scope] - SCOPE_RANK[top.scope]
    return rank > 0 || (rank === 0 && entry.id > top.id) ? entry : top
  })
}

export function keyChips(keys: string): string[] {
  return parseKeys(keys).flatMap(step => [
    ...(step.mod ? ['Ctrl'] : []),
    ...(step.alt ? ['Alt'] : []),
    KEY_LABELS[step.key] ?? step.key.toUpperCase(),
  ])
}

export function createShortcutRegistry(chordTimeoutMs = 1500): ShortcutRegistry {
  let entries: Entry[] = []
  let nextId = 1
  let pending: Step[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let chord: ChordState | null = null
  const chordListeners = new Set<() => void>()

  function setChord(next: ChordState | null) {
    chord = next
    chordListeners.forEach(listener => listener())
  }

  function cancelChord() {
    pending = []
    clearTimeout(timer)
    if (chord) setChord(null)
  }

  function startChord(sequence: Step[], candidates: Entry[]) {
    pending = sequence
    clearTimeout(timer)
    timer = setTimeout(cancelChord, chordTimeoutMs)
    const prefix = candidates[0].keys.split(/\s+/).slice(0, sequence.length).join(' ')
    const options = candidates.map(entry => ({
      keys: entry.keys.split(/\s+/).slice(sequence.length).join(' '),
      label: entry.label ?? entry.keys,
    }))
    setChord({ keys: prefix, options })
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) return
    if (event.repeat) {
      cancelChord()
      return
    }
    const step = toStep(event)
    if (!step) return

    const blocked = isTypingTarget(event.target) || isOverlayOpen()
    const interactive = isInteractiveTarget(event.target)
    const eligible = entries.filter(entry => (!blocked || entry.allowInInput) && !(entry.skipInteractive && interactive))
    const prior = pending
    cancelChord()

    const attempt = (sequence: Step[]): boolean => {
      const exact = eligible.filter(entry => entry.steps.length === sequence.length && startsWith(entry.steps, sequence))
      if (exact.length > 0) {
        event.preventDefault()
        best(exact).run(event)
        return true
      }
      const longer = eligible.filter(entry => entry.steps.length > sequence.length && startsWith(entry.steps, sequence))
      if (longer.length > 0) {
        event.preventDefault()
        startChord(sequence, longer)
        return true
      }
      return false
    }

    if (attempt([...prior, step])) return
    if (prior.length > 0) attempt([step])
  }

  return {
    register(binding) {
      const entry: Entry = { ...binding, id: nextId++, scope: binding.scope ?? 'global', steps: parseKeys(binding.keys) }
      entries = [...entries, entry]
      return () => {
        entries = entries.filter(item => item !== entry)
      }
    },
    list: () => [...entries],
    attach(target) {
      const listener = (event: Event) => handleKeyDown(event as KeyboardEvent)
      target.addEventListener('keydown', listener)
      return () => {
        target.removeEventListener('keydown', listener)
        cancelChord()
      }
    },
    getChord: () => chord,
    subscribeChord(listener) {
      chordListeners.add(listener)
      return () => {
        chordListeners.delete(listener)
      }
    },
  }
}

export const shortcutRegistry = createShortcutRegistry()

export function useKeyboardShortcuts(bindings: ShortcutBinding[]) {
  const latest = useRef(bindings)
  useEffect(() => {
    latest.current = bindings
  })

  const signature = bindings
    .map(binding => [binding.scope ?? 'global', binding.keys, binding.label ?? '', binding.group ?? '', binding.allowInInput ? 1 : 0, binding.skipInteractive ? 1 : 0].join('|'))
    .join('\n')

  useEffect(() => {
    const unregister = latest.current.map((_, index) => shortcutRegistry.register({
      ...latest.current[index],
      run: event => latest.current[index]?.run(event),
    }))
    return () => unregister.forEach(remove => remove())
  }, [signature])
}
