// Easter-egg plumbing: key sequences and a tiny "celebrate" event bus.

export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'] as const
export const MIAU = ['m', 'i', 'a', 'u'] as const

const MAX_KEYS = KONAMI.length

/** Adds a key to the rolling buffer (lowercased, capped to the longest secret). */
export function pushKey(buffer: readonly string[], key: string): string[] {
  const next = [...buffer, key.toLowerCase()]
  return next.length > MAX_KEYS ? next.slice(next.length - MAX_KEYS) : next
}

export function endsWithSequence(buffer: readonly string[], sequence: readonly string[]): boolean {
  if (buffer.length < sequence.length) return false
  const tail = buffer.slice(buffer.length - sequence.length)
  return tail.every((key, i) => key === sequence[i])
}

/** True when typing should not trigger secrets (the user is filling a field). */
export function isEditable(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
  const el = target as HTMLElement
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true
}

/** Clicks needed on the logo cat, and how fast they must come, to make it purr. */
export const PET_CLICKS = 7
export const PET_WINDOW_MS = 2500

/** Keeps the click times inside the window and says whether the cat was petted enough. */
export function registerPet(times: readonly number[], now: number): { times: number[]; purr: boolean } {
  const recent = [...times.filter(t => now - t < PET_WINDOW_MS), now]
  if (recent.length >= PET_CLICKS) return { times: [], purr: true }
  return { times: recent, purr: false }
}

export type Celebration = 'paw' | 'all-paid' | 'cat-rain'

const EVENT = 'cibi:celebrate'

export function celebrate(kind: Celebration): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<Celebration>(EVENT, { detail: kind }))
}

export function onCelebrate(listener: (kind: Celebration) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<Celebration>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
